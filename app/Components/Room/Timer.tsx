"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useInstance } from "../../Components/Instances";
import { useDispatch, useSelector } from "react-redux";
import { setIsActive } from "../../store/realtimeSlice";
import { RootState, AppDispatch } from "../../store/store";
import {
  updateTask,
  addTask,
  setActiveTask,
} from "../../store/taskSlice";
import { rtdb } from "../../../lib/firebase";
import { ref, set, remove, get, update, onValue, off, type DataSnapshot } from "firebase/database";
import { useStartButton } from "../../hooks/StartButton";
import { usePauseButton } from "../../hooks/PauseButton";
import { useCompleteButton } from "../../hooks/CompleteButton";

export default function Timer({
  onActiveChange,
  disabled,
  startRef,
  pauseRef,
  onComplete,
  secondsRef,
  localVolume = 0.2,
  onTaskRestore,
  onNewTaskStart,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  startCooldown = 0,
  lastStartTime = 0,
  initialRunning = false,
  isQuittingRef,
}: {
  onActiveChange?: (isActive: boolean) => void;
  disabled?: boolean;
  startRef?: React.RefObject<() => void>;
  pauseRef?: React.RefObject<() => void>;
  onComplete?: (duration: string) => void;
  secondsRef?: React.RefObject<number>;
  localVolume?: number;
  onTaskRestore?: (taskName: string, isRunning: boolean, taskId?: string) => void;
  onNewTaskStart?: () => void;
  startCooldown?: number;
  lastStartTime?: number;
  initialRunning?: boolean;
  isQuittingRef?: React.MutableRefObject<boolean>;
}) {
  const { user, currentInstance } = useInstance();
  const dispatch = useDispatch<AppDispatch>();
  const { currentInput: task, currentTaskId } = useSelector((state: RootState) => state.taskInput);
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);
  const checkingTaskBuffer = useSelector((state: RootState) => state.tasks.checkingTaskBuffer);
  
  
  // Initialize from secondsRef if switching from Pomodoro
  const [seconds, setSeconds] = useState(secondsRef?.current || 0);
  const [running, setRunning] = useState(initialRunning);
  const [justPaused, setJustPaused] = useState(false);
  
  // Sync with secondsRef on mount
  useEffect(() => {
    if (secondsRef?.current !== undefined && secondsRef.current !== seconds) {
      setSeconds(secondsRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const { hasStarted } = useSelector((state: RootState) => state.taskInput);
  
  // Use button hooks
  const { handleStart } = useStartButton();
  const { handleStop } = usePauseButton();
  const { handleComplete, showCompleteFeedback } = useCompleteButton();
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showStillWorkingModal, setShowStillWorkingModal] = useState(false);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [modalCountdown, setModalCountdown] = useState(300); // 5 minutes
  const modalCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityDurationRef = useRef(120); // Track timeout duration in ref to avoid effect re-runs
  const localVolumeRef = useRef(localVolume); // Track current volume for timeout callbacks
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const localIsQuittingRef = useRef(false); // Local flag to prevent saves during quit
  
  // Local cooldown state (start cooldown now comes from props)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [localCompleteCooldown, setLocalCompleteCooldown] = useState(0);
  const localCooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);
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
      // Don't save if we're quitting (check both refs)
      if ((isQuittingRef && isQuittingRef.current) || localIsQuittingRef.current) {
        return;
      }
      
      // Use currentTaskId from Redux (which tracks the selected task)
      const taskId = currentTaskId || activeTaskId;
      
      if (taskId && user?.id) {
        const timerRef = ref(rtdb, `TaskBuffer/${user.id}/timer_state`);

        const timerState = {
          running: isRunning,
          startTime: isRunning ? Date.now() : null,
          baseSeconds: baseSeconds,  // Always save the base seconds
          totalSeconds: !isRunning ? baseSeconds : 0,
          lastUpdate: Date.now(),
          taskId: taskId,
        };

        set(timerRef, timerState);
        
        // Also update LastTask whenever we save timer state
        if (taskId) {
          const lastTaskRef = ref(rtdb, `TaskBuffer/${user.id}/LastTask`);
          set(lastTaskRef, {
            taskId: taskId,
            taskName: task || "",
            timestamp: Date.now()
          });
        }
      }
    },
    [currentTaskId, activeTaskId, user?.id, isQuittingRef, task]
  );

  // Helper to clear timer state from Firebase
  const clearTimerState = React.useCallback(() => {
    if (user?.id) {
      const timerRef = ref(rtdb, `TaskBuffer/${user.id}/timer_state`);
      remove(timerRef);
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
    if (!user?.id || isInitialized) {
      return;
    }

    // Skip restoration if there's already an active timer (from Pomodoro)
    // Check if secondsRef has a value OR we already have seconds, indicating an active timer
    if ((hasStarted && secondsRef?.current && secondsRef.current > 0) || seconds > 0) {
      setIsInitialized(true);
      // If coming from Pomodoro with an active timer, set running state based on timerRunning
      // The running state is managed by RoomShell through onActiveChange
      return;
    }

    // Wait a bit to ensure Redux has loaded tasks
    const initTimer = setTimeout(async () => {
      console.log('[Timer] Init timer effect running');
      // First check for LastTask
      const lastTaskRef = ref(rtdb, `TaskBuffer/${user.id}/LastTask`);
      const lastTaskSnapshot = await get(lastTaskRef);
      
      if (lastTaskSnapshot.exists()) {
        const lastTaskData = lastTaskSnapshot.val();
        
        // Load this task's data from TaskBuffer
        const taskRef = ref(rtdb, `TaskBuffer/${user.id}/${lastTaskData.taskId}`);
        const taskSnapshot = await get(taskRef);
        
        if (taskSnapshot.exists()) {
          const taskData = taskSnapshot.val();
          const totalTime = taskData.total_time || 0;
          
          // Set the timer to this task's time
          setSeconds(totalTime);
          if (secondsRef) {
            secondsRef.current = totalTime;
          }
          
          // Set this as the active task
          console.log('[Timer] ⚠️ RESTORING active task from LastTask:', lastTaskData.taskId);
          dispatch(setActiveTask(lastTaskData.taskId));
          
          // Restore the task name in the input
          if (onTaskRestore) {
            onTaskRestore(lastTaskData.taskName || taskData.name, false, lastTaskData.taskId);
          }
          
          // Mark as initialized
          setIsInitialized(true);
          return;
        }
      }
      
      // Fallback to checking timer_state (for backward compatibility)
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
        
        // Also update secondsRef immediately
        if (secondsRef) {
          secondsRef.current = currentSeconds;
        }
        
        // Always restore the task associated with the timer
        if (timerState.taskId) {
          
          // First try to find in Redux
          const restoredTask = reduxTasks.find((t) => t.id === timerState.taskId);
          if (restoredTask) {
            // Skip restoration if task is already completed
            if (restoredTask.completed || restoredTask.status === "completed") {
              return;
            }
            // Set this as the active task
            console.log('[Timer] ⚠️ RESTORING active task from timer_state:', timerState.taskId);
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
              onTaskRestore(restoredTask.name, isRunning, timerState.taskId);
            }
          } else {
            // If not in Redux yet, try to get from TaskBuffer
            const taskRef = ref(rtdb, `TaskBuffer/${user.id}/${timerState.taskId}`);
            get(taskRef).then((taskSnapshot) => {
              const taskData = taskSnapshot.val();
              if (taskData && taskData.name) {
                // Check if task already exists in Redux before adding
                const existingTask = reduxTasks.find(t => t.id === timerState.taskId);
                if (!existingTask) {
                  // Add task to Redux if not already there
                  dispatch(addTask({
                    id: timerState.taskId,
                    name: taskData.name
                  }));
                }
                // Always set as active task and restore name
                console.log('[Timer] ⚠️ RESTORING active task from TaskBuffer lookup:', timerState.taskId);
                dispatch(setActiveTask(timerState.taskId));
                dispatch(updateTask({
                  id: timerState.taskId,
                  updates: { 
                    status: isRunning ? "in_progress" : "paused" as const,
                    timeSpent: taskData.total_time || currentSeconds
                  }
                }));
                if (onTaskRestore) {
                  onTaskRestore(taskData.name, isRunning, timerState.taskId);
                }
              } else {
              }
            });
          }
        }
      }
      
      setIsInitialized(true);
    }).catch(() => {
      setIsInitialized(true);
    });
    }, 1000); // Wait 1 second for Redux to load
    
    return () => clearTimeout(initTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, reduxTasks, onTaskRestore, dispatch, hasStarted, task, secondsRef]); // Dependencies for initialization

  // Store previous activeTaskId to detect actual task changes
  const previousActiveTaskIdRef = useRef<string | null>(null);
  
  // Watch for active task changes and load the task's accumulated time
  useEffect(() => {
    // Handle null activeTaskId (after quit) by resetting timer to 0
    if (!activeTaskId) {
      // Reset timer to 0 when no task is active (after quit)
      setSeconds(0);
      if (secondsRef) {
        secondsRef.current = 0;
      }
      // STOP the timer when no task is active
      setRunning(false);
      return;
    }
    
    if (!user?.id || !isInitialized) {
      return;
    }
    
    // Check if this is actually a task change
    const isTaskChange = previousActiveTaskIdRef.current !== activeTaskId;
    previousActiveTaskIdRef.current = activeTaskId;
    
    // Only load time if it's an actual task change
    if (!isTaskChange) {
      return;
    }
    
    // Skip if timer is currently running - don't interrupt an active timer
    if (running) {
      return;
    }
    
    // Skip if we just paused AND it's the same task to avoid race condition
    // But allow loading if it's a different task (task switch)
    if (justPaused && !isTaskChange) {
      return;
    }
    
    
    // Always load the task's time from TaskBuffer for consistency
    const taskRef = ref(rtdb, `TaskBuffer/${user.id}/${activeTaskId}`);
    
    get(taskRef).then((snapshot) => {
      // Double-check we're still on the same task
      if (activeTaskId !== previousActiveTaskIdRef.current) {
        return;
      }

      if (snapshot.exists()) {
        const taskData = snapshot.val();
        const totalTime = taskData.total_time || 0;
        
        // Update Redux with the time from TaskBuffer
        dispatch(updateTask({
          id: activeTaskId,
          updates: { timeSpent: totalTime }
        }));
        
        // Set the timer display to the task's total_time
        setSeconds(totalTime);
        if (secondsRef) {
          secondsRef.current = totalTime;
        }
      } else {
        // No data in TaskBuffer, check Redux for the task
        const reduxTask = reduxTasks.find(t => t.id === activeTaskId);
        if (reduxTask && reduxTask.timeSpent > 0) {
          setSeconds(reduxTask.timeSpent);
          if (secondsRef) {
            secondsRef.current = reduxTask.timeSpent;
          }
        } else {
          // This is truly a new task with no time
          setSeconds(0);
          if (secondsRef) {
            secondsRef.current = 0;
          }
        }
      }
    }).catch((error) => {
      console.error('[Timer] Error loading task data:', error);
      // On error, default to 0 for new task
      setSeconds(0);
      if (secondsRef) {
        secondsRef.current = 0;
      }
    });
    
    // Note: Don't change running state here, let StartButton handle it
  }, [activeTaskId, user?.id, secondsRef, dispatch, running, justPaused, reduxTasks]);

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

  // Update display every second and save total_time periodically
  useEffect(() => {
    if (running) {
      const interval = setInterval(() => {
        setSeconds((s) => {
          const newSeconds = s + 1;
          // Also update secondsRef to keep it in sync
          if (secondsRef) {
            secondsRef.current = newSeconds;
          }
          
          // Save total_time to Firebase every 5 seconds
          if (newSeconds % 5 === 0 && activeTaskId && user?.id && 
              !((isQuittingRef && isQuittingRef.current) || localIsQuittingRef.current)) {
            const taskRef = ref(rtdb, `TaskBuffer/${user.id}/${activeTaskId}`);
            update(taskRef, {
              total_time: newSeconds,
              updated_at: Date.now()
            }).catch(() => {
              // Task might have been deleted, ignore error
            });
            
            // Also update LastTask to ensure it's current
            const lastTaskRef = ref(rtdb, `TaskBuffer/${user.id}/LastTask`);
            set(lastTaskRef, {
              taskId: activeTaskId,
              taskName: task || "",
              timestamp: Date.now()
            });
          }
          
          return newSeconds;
        });
      }, 1000);
      return () => {
        clearInterval(interval);
      };
    }
  }, [running, secondsRef, activeTaskId, user?.id, task, isQuittingRef]);

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
      // Save timer state if there are seconds accumulated (whether running or paused)
      if (seconds > 0 && activeTaskId) {
        // Save as paused state
        saveTimerState(false, seconds);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [running, seconds, task, saveTimerState, user?.id, activeTaskId]);

  async function startTimer() {
    // Prevent starting if TaskBuffer is still being checked OR Timer hasn't initialized
    // This ensures we don't override timer state before restoration completes
    if (checkingTaskBuffer || !isInitialized) {
      return;
    }

    // Check if task is empty and provide feedback
    if (!task.trim()) {
      // Find TaskInput component and trigger feedback
      const taskInputElement = document.querySelector('textarea');
      if (taskInputElement) {
        taskInputElement.focus();
        
        // Add red underline temporarily
        const underlineElement = taskInputElement.parentElement?.querySelector('div[style*="height"]');
        if (underlineElement && underlineElement instanceof HTMLElement) {
          const originalBg = underlineElement.style.background;
          underlineElement.style.background = '#ef4444'; // red-500
          underlineElement.style.transition = 'background 200ms';
          
          setTimeout(() => {
            underlineElement.style.background = originalBg;
          }, 2000);
        }
      }
      return;
    }

    // If timer is running and we're switching to a different task, pause first
    if (running && activeTaskId && currentTaskId && activeTaskId !== currentTaskId) {
      pauseTimer();
      // Wait for pause to complete
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Check if this task has accumulated time (making it a resume)
    let isResume = false;
    if (activeTaskId) {
      const activeTask = reduxTasks.find(t => t.id === activeTaskId);
      isResume = (activeTask?.timeSpent || 0) > 0 || seconds > 0;
    } else {
      isResume = seconds > 0;
    }


    await handleStart({
      task: task || "",
      seconds,
      isResume,
      localVolume,
      onNewTaskStart,
      lastStartTime,
      saveTimerState,
      setRunning,
      setIsStarting,
      heartbeatIntervalRef,
      pauseTimer,
      running,
    });
  }

  // Pause function using hook
  const pauseTimer = useCallback(() => {
    setJustPaused(true);
    
    handleStop({
      task: task || "",
      seconds,
      saveTimerState,
      setRunning,
      setIsStarting,
      heartbeatIntervalRef,
    });
    
    // Clear the flag after a short delay
    setTimeout(() => {
      setJustPaused(false);
    }, 1000);
  }, [handleStop, task, seconds, saveTimerState]);

  // Complete function using hook
  async function completeTimer() {
    await handleComplete({
      task: task || "",
      seconds,
      localVolume,
      clearTimerState,
      onComplete,
      setIsCompleting,
      heartbeatIntervalRef,
    });
  }

  // Auto-pause when countdown reaches 0
  useEffect(() => {
    if (showStillWorkingModal && modalCountdown === 0) {
      setShowStillWorkingModal(false);
      pauseTimer();
    }
  }, [showStillWorkingModal, modalCountdown, pauseTimer]);

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
    pauseTimer();
  };

  // Expose startTimer to parent via ref
  React.useEffect(() => {
    if (startRef) {
      startRef.current = startTimer;
    }
  });

  // Expose pauseTimer to parent via pauseRef
  React.useEffect(() => {
    if (pauseRef) {
      pauseRef.current = pauseTimer;
    }
  });
  
  // Listen for active state changes in other rooms and pause if needed
  React.useEffect(() => {
    if (!user?.id || !currentInstance?.id) return;
    
    // Listen to all room indexes to detect when user becomes active elsewhere
    const roomIndexRef = ref(rtdb, 'RoomIndex');
    
    const handleActiveStateChange = (snapshot: DataSnapshot) => {
      if (!snapshot.exists()) return;
      
      const allRooms = snapshot.val();
      let userActiveElsewhere = false;
      
      // Check if user is active in any other room
      for (const [roomId, users] of Object.entries(allRooms)) {
        if (roomId !== currentInstance.id && users && (users as Record<string, unknown>)[user.id]) {
          const userInRoom = (users as Record<string, { isActive?: boolean }>)[user.id];
          if (userInRoom.isActive) {
            userActiveElsewhere = true;
            break;
          }
        }
      }
      
      // If user is active elsewhere and timer is running here, pause it
      if (userActiveElsewhere && running) {
        console.log('[Timer] User became active in another room, pausing timer');
        pauseTimer();
      }
    };
    
    onValue(roomIndexRef, handleActiveStateChange);
    
    return () => {
      off(roomIndexRef, 'value', handleActiveStateChange);
    };
  }, [user?.id, currentInstance?.id, running, pauseTimer]);

  // Update secondsRef with the current seconds value
  React.useEffect(() => {
    if (secondsRef) secondsRef.current = seconds;
  }, [seconds, secondsRef]);
  
  // Sync local quit flag with external quit flag
  React.useEffect(() => {
    if (isQuittingRef) {
      localIsQuittingRef.current = isQuittingRef.current;
    }
  }, [isQuittingRef]);

  // Cleanup heartbeat on unmount
  React.useEffect(() => {
    const heartbeatInterval = heartbeatIntervalRef.current;
    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      
      // Cleanup handled by PresenceService
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 px-4 sm:px-0">
      <div className="text-3xl sm:text-4xl mb-2 font-mono">{formatTime(seconds)}</div>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md sm:max-w-none">
        {!running && !isStarting ? (
          <div className="flex flex-col items-center gap-2">
            <button
              className={`bg-white text-black font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-105 w-full sm:w-auto ${
                !task.trim() || checkingTaskBuffer || !isInitialized 
                  ? "cursor-not-allowed" 
                  : "cursor-pointer"
              }`}
              onClick={startTimer}
              disabled={disabled || checkingTaskBuffer || !isInitialized}
            >
              {(() => {
                // Always show the appropriate Start/Resume text, even while loading
                if (activeTaskId) {
                  const activeTask = reduxTasks.find(t => t.id === activeTaskId);
                  return (activeTask?.timeSpent || 0) > 0 || seconds > 0 ? "Resume" : "Start";
                }
                return seconds > 0 ? "Resume" : "Start";
              })()}
            </button>
          </div>
        ) : (
          <>
            <button
              className="bg-white text-black font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-102 disabled:opacity-40 w-full sm:w-48 cursor-pointer"
              onClick={pauseTimer}
            >
              Pause
            </button>
            <div className="flex flex-col items-center gap-2">
              <button
                className={`${showCompleteFeedback ? 'bg-green-600' : 'bg-green-500'} text-white font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-102 w-full sm:w-48 ${seconds < 1 ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                onClick={completeTimer}
                disabled={isCompleting || seconds < 1}
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
