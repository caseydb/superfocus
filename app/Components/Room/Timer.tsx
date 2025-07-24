"use client";
import React, { useEffect, useRef, useState } from "react";
import { useInstance } from "../../Components/Instances";
import { useDispatch, useSelector } from "react-redux";
import { setIsActive } from "../../store/realtimeSlice";
import { RootState, AppDispatch } from "../../store/store";
import {
  updateTask,
  transferTaskToPostgres,
  startTimeSegment,
  endTimeSegment,
  addTaskToBufferWhenStarted,
  addTask,
  createTaskThunk,
  setActiveTask,
  reorderTasks,
} from "../../store/taskSlice";
import { addHistoryEntry } from "../../store/historySlice";
import { updateLeaderboardOptimistically, refreshLeaderboard } from "../../store/leaderboardSlice";
import { rtdb } from "../../../lib/firebase";
import { ref, set, remove, update, get, onDisconnect } from "firebase/database";
import { v4 as uuidv4 } from "uuid";

export default function Timer({
  onActiveChange,
  disabled,
  startRef,
  pauseRef,
  onComplete,
  secondsRef,
  requiredTask = true,
  task,
  localVolume = 0.2,
  onTaskRestore,
  onNewTaskStart,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  startCooldown = 0,
  lastStartTime = 0,
}: {
  onActiveChange?: (isActive: boolean) => void;
  disabled?: boolean;
  startRef?: React.RefObject<() => void>;
  pauseRef?: React.RefObject<() => void>;
  onComplete?: (duration: string) => void;
  secondsRef?: React.RefObject<number>;
  requiredTask?: boolean;
  task?: string;
  localVolume?: number;
  onTaskRestore?: (taskName: string) => void;
  onNewTaskStart?: () => void;
  startCooldown?: number;
  lastStartTime?: number;
}) {
  const { currentInstance, user } = useInstance();
  const dispatch = useDispatch<AppDispatch>();
  
  // Log mount/unmount
  React.useEffect(() => {
    return () => {
    };
  }, []);
  
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const reduxUser = useSelector((state: RootState) => state.user);
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showCompleteFeedback, setShowCompleteFeedback] = useState(false);
  const isInitializedRef = useRef(false);
  const [showStillWorkingModal, setShowStillWorkingModal] = useState(false);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [modalCountdown, setModalCountdown] = useState(300); // 5 minutes
  const modalCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityDurationRef = useRef(120); // Track timeout duration in ref to avoid effect re-runs
  const localVolumeRef = useRef(localVolume); // Track current volume for timeout callbacks
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Local cooldown state (start cooldown now comes from props)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [localCompleteCooldown, setLocalCompleteCooldown] = useState(0);
  const localCooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes for start
  const MIN_DURATION_MS = 5 * 60 * 1000; // 5 minutes for complete/quit
  
  // Get preferences from Redux
  const preferences = useSelector((state: RootState) => state.preferences);
  
  // Update local cooldowns every second (only complete cooldown now)
  useEffect(() => {
    const updateCooldowns = () => {
      // Update complete/quit cooldown based on current timer duration
      if (running && seconds > 0) {
        const remainingDuration = Math.max(0, MIN_DURATION_MS / 1000 - seconds);
        setLocalCompleteCooldown(Math.ceil(remainingDuration));
      } else {
        setLocalCompleteCooldown(0);
      }
    };
    
    // Update immediately
    updateCooldowns();
    
    // Then update every second
    const interval = setInterval(updateCooldowns, 1000);
    localCooldownIntervalRef.current = interval;
    
    return () => {
      if (localCooldownIntervalRef.current) {
        clearInterval(localCooldownIntervalRef.current);
      }
    };
  }, [running, seconds, MIN_DURATION_MS]);

  // Helper to save timer state to Firebase (only on state changes, not every second)
  const saveTimerState = React.useCallback(
    (isRunning: boolean, baseSeconds: number = 0) => {
      // Find the task ID from Redux tasks
      const activeTask = reduxTasks.find((t) => t.name === task?.trim());
      if (activeTask?.id && user?.id) {
        const timerRef = ref(rtdb, `TaskBuffer/${user.id}/timer_state`);

        const timerState = {
          running: isRunning,
          startTime: isRunning ? Date.now() : null,
          baseSeconds: isRunning ? baseSeconds : 0,
          totalSeconds: !isRunning ? baseSeconds : 0,
          lastUpdate: Date.now(),
          taskId: activeTask.id,
        };

        set(timerRef, timerState);
        
        // Update ActiveWorker status
        if (currentInstance) {
          const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
          if (isRunning) {
            const now = Date.now();
            const activeWorkerData = {
              userId: user.id,
              roomId: currentInstance.id,
              taskId: activeTask.id,
              isActive: true,
              lastSeen: now,
              displayName: user.displayName || "Anonymous"
            };
            set(activeWorkerRef, activeWorkerData);
            
            // Set up onDisconnect to remove ActiveWorker if user disconnects
            onDisconnect(activeWorkerRef).remove();
          } else {
            // Remove ActiveWorker when not running
            remove(activeWorkerRef);
            
            // Cancel onDisconnect since we're manually removing
            onDisconnect(activeWorkerRef).cancel();
          }
        }
      }
    },
    [reduxTasks, task, user?.id, user?.displayName, currentInstance]
  );

  // Helper to clear timer state from Firebase
  const clearTimerState = React.useCallback(() => {
    if (user?.id) {
      const timerRef = ref(rtdb, `TaskBuffer/${user.id}/timer_state`);
      remove(timerRef);
      
      // Also remove ActiveWorker
      const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
      remove(activeWorkerRef);
      onDisconnect(activeWorkerRef).cancel();
    }
  }, [user?.id]);

  // Helper to format time as mm:ss or hh:mm:ss based on duration
  function formatTime(s: number) {
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const secs = (s % 60).toString().padStart(2, "0");

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes}:${secs}`;
    } else {
      return `${minutes}:${secs}`;
    }
  }

  // One-time restoration from Firebase on mount
  useEffect(() => {
    if (!user?.id || isInitializedRef.current) {
      return;
    }

    // Wait a bit to ensure Redux has loaded tasks
    const initTimer = setTimeout(() => {
      const timerRef = ref(rtdb, `TaskBuffer/${user.id}/timer_state`);
      
      // One-time read to restore state
      get(timerRef).then((snapshot) => {
      const timerState = snapshot.val();
      
      if (timerState && timerState.taskId) {
        const isRunning = timerState.running || false;
        let currentSeconds = 0;

        if (isRunning && timerState.startTime) {
          // Calculate current seconds: base + elapsed time since start
          const elapsedMs = Date.now() - timerState.startTime;
          const elapsedSeconds = Math.floor(elapsedMs / 1000);
          currentSeconds = (timerState.baseSeconds || 0) + elapsedSeconds;
        } else {
          // Use stored total seconds when paused
          currentSeconds = timerState.totalSeconds || 0;
        }

        // Restore state
        setSeconds(currentSeconds);
        setRunning(isRunning);
        
        // Always restore the task associated with the timer
        if (timerState.taskId) {
          
          // First try to find in Redux
          const restoredTask = reduxTasks.find((t) => t.id === timerState.taskId);
          if (restoredTask) {
            // Set this as the active task
            dispatch(setActiveTask(timerState.taskId));
            // Update task status based on timer state
            dispatch(updateTask({
              id: timerState.taskId,
              updates: { 
                status: isRunning ? "in_progress" : "paused" as const,
                timeSpent: currentSeconds
              }
            }));
            if (onTaskRestore) {
              onTaskRestore(restoredTask.name);
            }
          } else {
            // If not in Redux yet, try to get from TaskBuffer
            const taskRef = ref(rtdb, `TaskBuffer/${user.id}/${timerState.taskId}`);
            get(taskRef).then((taskSnapshot) => {
              const taskData = taskSnapshot.val();
              if (taskData && taskData.name) {
                // Add task to Redux if not already there
                dispatch(addTask({
                  id: timerState.taskId,
                  name: taskData.name
                }));
                // Always set as active task and restore name
                dispatch(setActiveTask(timerState.taskId));
                dispatch(updateTask({
                  id: timerState.taskId,
                  updates: { 
                    status: isRunning ? "in_progress" : "paused" as const,
                    timeSpent: currentSeconds
                  }
                }));
                if (onTaskRestore) {
                  onTaskRestore(taskData.name);
                }
              } else {
              }
            });
          }
        }
      }
      
      isInitializedRef.current = true;
    }).catch(() => {
      isInitializedRef.current = true;
    });
    }, 1000); // Wait 1 second for Redux to load
    
    return () => clearTimeout(initTimer);
  }, [user?.id, reduxTasks, onTaskRestore, dispatch]); // Dependencies for initialization

  // Note: Room user count monitoring removed to keep all Firebase activity in TaskBuffer
  // If needed, this could be re-implemented using TaskBuffer/rooms/{roomId}/activeUsers

  // Notify parent of running state and update Redux
  useEffect(() => {
    if (onActiveChange) onActiveChange(running);
    dispatch(setIsActive(running));
  }, [running, onActiveChange, dispatch]);

  // Load user's inactivity timeout preference (removed - not part of task data)
  // If preferences are needed, they should be stored elsewhere, not in TaskBuffer

  // Keep localVolumeRef in sync with localVolume prop
  useEffect(() => {
    localVolumeRef.current = localVolume;
  }, [localVolume]);

  // Keep inactivityDurationRef in sync with preferences focus_check_time (convert minutes to seconds)
  useEffect(() => {
    inactivityDurationRef.current = preferences.focus_check_time * 60;
  }, [preferences.focus_check_time]);

  // Update display every second when running (local only, no Firebase writes)
  useEffect(() => {
    if (running) {
      const interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
      return () => {
        clearInterval(interval);
      };
    }
  }, [running]);

  // Inactivity detection based on timer duration
  useEffect(() => {
    if (!running || showStillWorkingModal) {
      // Clear any existing timeout when not running or modal already showing
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
      return;
    }

    // Set timeout based on user preference when timer starts running
    inactivityTimeoutRef.current = setTimeout(() => {
      if (running) {
        setShowStillWorkingModal(true);
        setModalCountdown(300); // Reset countdown to 5 minutes

        // Play inactive sound locally only if not muted (check current volume from ref)
        if (localVolumeRef.current > 0) {
          const inactiveAudio = new Audio("/inactive.mp3");
          inactiveAudio.volume = localVolumeRef.current;
          inactiveAudio.play();
        }
      }
    }, inactivityDurationRef.current * 1000); // Convert seconds to milliseconds

    return () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
    };
  }, [running, showStillWorkingModal]);

  // Modal countdown effect
  useEffect(() => {
    if (showStillWorkingModal && modalCountdown > 0) {
      modalCountdownRef.current = setTimeout(() => {
        setModalCountdown((prev) => prev - 1);
      }, 1000);

      return () => {
        if (modalCountdownRef.current) {
          clearTimeout(modalCountdownRef.current);
        }
      };
    }
  }, [showStillWorkingModal, modalCountdown]);

  // Pause timer when user leaves the page (closes tab, refreshes, or navigates away)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (running) {
        // Pause the timer and save state to Firebase
        saveTimerState(false, seconds);
        
        // Remove ActiveWorker immediately on page unload
        if (user?.id) {
          const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
          remove(activeWorkerRef);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [running, seconds, task, saveTimerState, user?.id]);

  async function handleStart() {
    setIsStarting(true);

    // Move task to position #1 in task list BEFORE starting timer
    if (task && task.trim() && user?.id) {
      await moveTaskToTop();
      // Small delay to ensure TaskList component receives the update
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Find or create the task
    const activeTask = reduxTasks.find((t) => t.name === task?.trim());
    let taskId = activeTask?.id || "";

    // If task doesn't exist, create it
    if (!activeTask && task?.trim() && user?.id && currentInstance && reduxUser.user_id) {
      taskId = uuidv4();

      // Add optimistic task immediately
      dispatch(
        addTask({
          id: taskId,
          name: task.trim(),
        })
      );

      // Persist to PostgreSQL database
      dispatch(
        createTaskThunk({
          id: taskId,
          name: task.trim(),
          userId: reduxUser.user_id, // PostgreSQL UUID
        })
      );

      // Set the new task as active
      dispatch(setActiveTask(taskId));
    } else if (activeTask) {
      // Set existing task as active
      dispatch(setActiveTask(activeTask.id));
    }

    // Optimistically update task status to in_progress
    if (taskId) {
      dispatch(
        updateTask({
          id: taskId,
          updates: { status: "in_progress" as const },
        })
      );
    }

    // Add task to TaskBuffer first, then start a new time segment
    if (taskId && user?.id && currentInstance) {

      // First, ensure task exists in TaskBuffer
      await dispatch(
        addTaskToBufferWhenStarted({
          id: taskId,
          name: task!.trim(),
          userId: reduxUser.user_id!,
          roomId: currentInstance.id,
          firebaseUserId: user.id,
        })
      ).unwrap();

      // Then start the time segment
      await dispatch(
        startTimeSegment({
          taskId,
          firebaseUserId: user.id,
        })
      ).unwrap();
    }

    // Write heartbeat to Firebase
    if (user?.id) {
      const heartbeatRef = ref(rtdb, `TaskBuffer/${user.id}/heartbeat`);

      const heartbeatData = {
        taskId,
        start_time: Date.now(),
        last_seen: Date.now(),
        is_running: true,
      };

      set(heartbeatRef, heartbeatData);
      
      // Create ActiveWorker entry
      if (currentInstance) {
        const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
        const now = Date.now();
        const activeWorkerData = {
          userId: user.id,
          roomId: currentInstance.id,
          taskId,
          isActive: true,
          lastSeen: now,
          displayName: user.displayName || "Anonymous"
        };
        set(activeWorkerRef, activeWorkerData);
        
        // Set up onDisconnect to remove ActiveWorker if user disconnects
        onDisconnect(activeWorkerRef).remove();
      }

      // Start heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }

      heartbeatIntervalRef.current = setInterval(() => {
        const now = Date.now();
        
        // Update both heartbeat and ActiveWorker with error handling
        Promise.all([
          update(heartbeatRef, { last_seen: now }).catch(() => {
            // Ignore heartbeat update errors
          }),
          currentInstance ? update(ref(rtdb, `ActiveWorker/${user.id}`), { lastSeen: now }).then(() => {
          }).catch(() => {
            // Try to recreate the ActiveWorker entry if update failed
            const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
            set(activeWorkerRef, {
              userId: user.id,
              roomId: currentInstance.id,
              taskId,
              isActive: true,
              lastSeen: now,
              displayName: user.displayName || "Anonymous"
            }).catch(() => {});
          }) : Promise.resolve()
        ]);
      }, 5000); // Update every 5 seconds for better reliability
    }

    // Set running state AFTER all async operations
    setRunning(true);
    setIsStarting(false);

    // Small delay to ensure state is set before Firebase save
    setTimeout(() => {
      saveTimerState(true, seconds);
    }, 50);

    // Only play start sound and notify if this is an initial start (not a resume from paused state)
    // Check if seconds is 0 to ensure this is a fresh start, not resuming a paused timer
    if (seconds === 0) {
      // Always play start sound locally
      const startAudio = new Audio("/started.mp3");
      startAudio.volume = localVolume;
      startAudio.play();

      // Notify parent that a new task is starting
      if (onNewTaskStart) {
        onNewTaskStart();
      }
      
      // Check cooldown using prop value
      const now = Date.now();
      const timeSinceLastStart = lastStartTime > 0 ? (now - lastStartTime) : COOLDOWN_MS;
      
      // Only send start event to RTDB if cooldown has passed
      if (timeSinceLastStart >= COOLDOWN_MS) {
        notifyEvent("start");
      }
    }
  }

  // Helper to move task to position #1 in task list
  const moveTaskToTop = React.useCallback(async (): Promise<void> => {
    if (!task?.trim()) return;
    
    const taskName = task.trim();
    const currentTaskIndex = reduxTasks.findIndex((t) => t.name === taskName);
    
    if (currentTaskIndex > 0) {
      // Task exists but not at position 0, move it to the top
      const reorderedTasks = [...reduxTasks];
      const [taskToMove] = reorderedTasks.splice(currentTaskIndex, 1);
      // Create a new task object with updated order (to avoid mutating Redux state)
      const updatedTask = { ...taskToMove, order: -1 };
      reorderedTasks.unshift(updatedTask);
      dispatch(reorderTasks(reorderedTasks));
    }
    // If task is already at position 0 or doesn't exist yet, no need to reorder
    return Promise.resolve();
  }, [task, reduxTasks, dispatch]);

  // Helper to mark matching task as completed in task list (removed - task list not in TaskBuffer)
  const completeTaskInList = React.useCallback(async () => {
    // Task list operations should be handled through PostgreSQL
    // This is a no-op for now
  }, []);

  // Add event notification for start, complete, and quit
  function notifyEvent(type: "start" | "complete" | "quit", duration?: number) {
    if (currentInstance && user?.id) {
      // Write to new GlobalEffects structure
      const eventId = `${user.id}-${type}-${Date.now()}`;
      const eventRef = ref(rtdb, `GlobalEffects/${currentInstance.id}/events/${eventId}`);
      const eventData: { displayName: string; userId: string; type: string; timestamp: number; duration?: number } = { 
        displayName: user.displayName, 
        userId: user.id, 
        type, 
        timestamp: Date.now() 
      };
      
      // Include duration for complete/quit events
      if ((type === "complete" || type === "quit") && duration !== undefined) {
        eventData.duration = duration;
      }
      
      set(eventRef, eventData);
      
      // Auto-cleanup old events after 10 seconds
      setTimeout(() => {
        remove(eventRef);
      }, 10000);
    }
  }

  const handleStop = React.useCallback(() => {
    // Optimistically update task status to paused
    const activeTask = reduxTasks.find((t) => t.name === task?.trim());
    if (activeTask?.id) {
      dispatch(
        updateTask({
          id: activeTask.id,
          updates: { status: "paused" as const },
        })
      );

      // End the current time segment in TaskBuffer
      if (user?.id) {
        dispatch(
          endTimeSegment({
            taskId: activeTask.id,
            firebaseUserId: user.id,
          })
        );
      }

      // Update heartbeat to show timer is paused
      if (user?.id) {
        const heartbeatRef = ref(rtdb, `TaskBuffer/${user.id}/heartbeat`);
        update(heartbeatRef, {
          is_running: false,
          last_seen: Date.now(),
        });
        
        // Remove ActiveWorker when pausing
        const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
        remove(activeWorkerRef);
        onDisconnect(activeWorkerRef).cancel();
      }
    }

    // Clear heartbeat interval
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    // Set state AFTER all operations
    setRunning(false);
    setIsStarting(false);

    // Save timer state to Firebase AFTER setting local state
    setTimeout(() => {
      saveTimerState(false, seconds);
    }, 50);
  }, [dispatch, task, reduxTasks, user?.id, seconds, saveTimerState]);

  // Auto-pause when countdown reaches 0
  useEffect(() => {
    if (showStillWorkingModal && modalCountdown === 0) {
      setShowStillWorkingModal(false);
      handleStop();
    }
  }, [showStillWorkingModal, modalCountdown, handleStop]);

  // Handle "Yes, still working" response
  const handleStillWorking = () => {
    setShowStillWorkingModal(false);
    setModalCountdown(300); // Reset countdown to 5 minutes for next time
    // Reset the inactivity timer
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }
    // Start a new inactivity timer based on user preference
    inactivityTimeoutRef.current = setTimeout(() => {
      if (running) {
        setShowStillWorkingModal(true);
        setModalCountdown(300); // 5 minutes

        // Play inactive sound locally only if not muted (check current volume from ref)
        if (localVolumeRef.current > 0) {
          const inactiveAudio = new Audio("/inactive.mp3");
          inactiveAudio.volume = localVolumeRef.current;
          inactiveAudio.play();
        }
      }
    }, inactivityDurationRef.current * 1000);
  };

  // Handle "No, pause it" response
  const handlePauseFromInactivity = () => {
    setShowStillWorkingModal(false);
    handleStop();
  };

  // Expose handleStart to parent via ref
  React.useEffect(() => {
    if (startRef) {
      startRef.current = handleStart;
    }
  });

  // Expose handleStop to parent via pauseRef
  React.useEffect(() => {
    if (pauseRef) {
      pauseRef.current = handleStop;
    }
  });

  // Update secondsRef with the current seconds value
  React.useEffect(() => {
    if (secondsRef) secondsRef.current = seconds;
  }, [seconds, secondsRef]);

  // Cleanup heartbeat and ActiveWorker on unmount
  React.useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
      // Remove ActiveWorker on unmount if timer is running
      if (running && user?.id) {
        const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
        remove(activeWorkerRef);
      }
    };
  }, [running, user?.id]);

  return (
    <div className="flex flex-col items-center gap-4 px-4 sm:px-0">
      <div className="text-3xl sm:text-4xl mb-2 font-mono">{formatTime(seconds)}</div>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md sm:max-w-none">
        {!running && !isStarting ? (
          <div className="flex flex-col items-center gap-2">
            <button
              className="bg-white text-black font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-105 disabled:opacity-40 w-full sm:w-auto cursor-pointer"
              onClick={handleStart}
              disabled={disabled || !requiredTask}
            >
              {seconds > 0 ? "Resume" : "Start"}
            </button>
          </div>
        ) : (
          <>
            <button
              className="bg-white text-black font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-102 disabled:opacity-40 w-full sm:w-48 cursor-pointer"
              onClick={handleStop}
            >
              Pause
            </button>
            <div className="flex flex-col items-center gap-2">
              <button
                className={`${showCompleteFeedback ? 'bg-green-600' : 'bg-green-500'} text-white font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-102 w-full sm:w-48 cursor-pointer`}
                onClick={async () => {
                // Prevent multiple clicks
                if (isCompleting) {
                  // Show feedback that button is on cooldown
                  setShowCompleteFeedback(true);
                  setTimeout(() => setShowCompleteFeedback(false), 300);
                  return;
                }
                setIsCompleting(true);
                
                // Play completion sound immediately for instant feedback
                const completeAudio = new Audio("/complete.mp3");
                completeAudio.volume = localVolume;
                completeAudio.play();
                
                const completionTime = formatTime(seconds);

                // Mark matching task as completed in task list
                if (task && task.trim()) {
                  completeTaskInList();
                }

                // Mark today as completed for streak tracking
                if (typeof window !== "undefined") {
                  const windowWithStreak = window as Window & { markStreakComplete?: () => Promise<void> };
                  if (windowWithStreak.markStreakComplete) {
                    windowWithStreak.markStreakComplete();
                  }
                }
                
                // Only send complete event to RTDB if minimum duration is met
                if (seconds >= MIN_DURATION_MS / 1000) {
                  notifyEvent("complete", seconds);
                }

                // Optimistically update task status to completed
                const activeTask = reduxTasks.find((t) => t.name === task?.trim());
                if (activeTask?.id) {
                  dispatch(
                    updateTask({
                      id: activeTask.id,
                      updates: { status: "completed" as const, completed: true },
                    })
                  );
                }

                // Transfer task to Postgres - this handles time segments automatically
                const activeTaskForTransfer = reduxTasks.find((t) => t.name === task?.trim());

                if (activeTaskForTransfer?.id && user?.id) {

                  // Transfer task from TaskBuffer to Postgres atomically
                  // This will:
                  // 1. Calculate final duration including any open segments
                  // 2. Update the task in PostgreSQL
                  // 3. Delete the task from TaskBuffer after successful update
                  if (typeof window !== "undefined") {
                    const token = localStorage.getItem("firebase_token") || "";

                    try {
                      const result = await dispatch(
                        transferTaskToPostgres({
                          taskId: activeTaskForTransfer.id,
                          firebaseUserId: user.id,
                          status: "completed",
                          token,
                          duration: seconds, // Pass the actual timer seconds
                        })
                      ).unwrap();

                      // Add optimistic update to history
                      if (result && result.savedTask && reduxUser?.user_id) {
                        dispatch(
                          addHistoryEntry({
                            taskId: result.savedTask.id,
                            userId: reduxUser.user_id,
                            displayName: `${reduxUser.first_name || ""} ${reduxUser.last_name || ""}`.trim() || "Anonymous",
                            taskName: result.savedTask.task_name || task || "Unnamed Task",
                            duration: seconds,
                          })
                        );
                        
                        // Update leaderboard optimistically and refresh from server
                        dispatch(
                          updateLeaderboardOptimistically({
                            userId: reduxUser.user_id,
                            firstName: reduxUser.first_name || "",
                            lastName: reduxUser.last_name || "",
                            profileImage: reduxUser.profile_image || null,
                            taskDuration: seconds,
                          })
                        );
                        
                        // Refresh leaderboard from server to get accurate totals
                        dispatch(refreshLeaderboard());
                      }

                    } catch (error) {
                      // Show error message to user
                      const errorMessage = error instanceof Error ? error.message : "Unknown error";
                      alert(`Failed to save task completion: ${errorMessage}`);
                    }
                  }
                }

                // Heartbeat gets cleared when task is removed from TaskBuffer

                // Clear heartbeat interval
                if (heartbeatIntervalRef.current) {
                  clearInterval(heartbeatIntervalRef.current);
                  heartbeatIntervalRef.current = null;
                }
                
                // Remove ActiveWorker on completion
                if (user?.id) {
                  const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
                  remove(activeWorkerRef);
                  onDisconnect(activeWorkerRef).cancel();
                }

                clearTimerState(); // Clear Firebase state when completing
                dispatch(setIsActive(false)); // Update Redux state

                if (onComplete) {
                  onComplete(completionTime);
                }
                
                // Reset completing state after 2 seconds
                setTimeout(() => {
                  setIsCompleting(false);
                }, 2000);
              }}
            >
                {showCompleteFeedback ? 'Wait...' : 'Complete'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Still Working Modal */}
      {showStillWorkingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-800 relative">
            {/* Elegant countdown circle */}
            <div className="absolute top-4 right-4 w-14 h-14">
              <svg className="w-14 h-14 transform -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="26" stroke="#374151" strokeWidth="4" fill="none" />
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  stroke="#FFAA00"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={`${(modalCountdown / 300) * 163.36} 163.36`}
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-white font-mono text-sm">
                {(() => {
                  const minutes = Math.floor(modalCountdown / 60);
                  const seconds = modalCountdown % 60;
                  if (minutes > 0) {
                    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
                  } else {
                    return seconds.toString();
                  }
                })()}
              </span>
            </div>

            <h2 className="text-2xl font-bold text-white mb-4 text-center">Are you still working?</h2>
            <p className="text-gray-300 mb-6 text-center">
              Your timer has been going for{" "}
              {preferences.focus_check_time < 60
                ? `${preferences.focus_check_time} minute${preferences.focus_check_time !== 1 ? "s" : ""}`
                : `${Math.floor(preferences.focus_check_time / 60)} hour${
                    Math.floor(preferences.focus_check_time / 60) !== 1 ? "s" : ""
                  }`}
              . Are you still working on &quot;{task}&quot;?
            </p>
            <div className="flex gap-4">
              <button
                onClick={handleStillWorking}
                className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold cursor-pointer"
              >
                Yes
              </button>
              <button
                onClick={handlePauseFromInactivity}
                className="flex-1 bg-gray-700 text-white px-6 py-3 rounded-lg hover:bg-gray-600 transition-colors font-semibold cursor-pointer"
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
