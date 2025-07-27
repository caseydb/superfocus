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
import { ref, set, remove, get, onDisconnect } from "firebase/database";
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
  requiredTask = true,
  localVolume = 0.2,
  onTaskRestore,
  onNewTaskStart,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  startCooldown = 0,
  lastStartTime = 0,
  initialRunning = false,
}: {
  onActiveChange?: (isActive: boolean) => void;
  disabled?: boolean;
  startRef?: React.RefObject<() => void>;
  pauseRef?: React.RefObject<() => void>;
  onComplete?: (duration: string) => void;
  secondsRef?: React.RefObject<number>;
  requiredTask?: boolean;
  localVolume?: number;
  onTaskRestore?: (taskName: string, isRunning: boolean) => void;
  onNewTaskStart?: () => void;
  startCooldown?: number;
  lastStartTime?: number;
  initialRunning?: boolean;
}) {
  const { currentInstance, user } = useInstance();
  const dispatch = useDispatch<AppDispatch>();
  const { currentInput: task } = useSelector((state: RootState) => state.taskInput);
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);
  
  // Log mount/unmount
  React.useEffect(() => {
    return () => {
    };
  }, []);
  
  // Initialize from secondsRef if switching from Pomodoro
  const [seconds, setSeconds] = useState(secondsRef?.current || 0);
  const [running, setRunning] = useState(initialRunning);
  
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
      // Use activeTaskId if available, otherwise find by name
      let taskId = activeTaskId;
      if (!taskId) {
        const activeTask = reduxTasks.find((t) => t.name === task?.trim());
        taskId = activeTask?.id || null;
      }
      
      console.log('[Timer] saveTimerState called:', { taskId, isRunning, baseSeconds, activeTaskId });
      
      if (taskId && user?.id) {
        const timerRef = ref(rtdb, `TaskBuffer/${user.id}/timer_state`);

        const timerState = {
          running: isRunning,
          startTime: isRunning ? Date.now() : null,
          baseSeconds: isRunning ? baseSeconds : 0,
          totalSeconds: !isRunning ? baseSeconds : 0,
          lastUpdate: Date.now(),
          taskId: taskId,
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
              taskId: taskId,
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
    [reduxTasks, task, user?.id, user?.displayName, currentInstance, activeTaskId]
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

    // Skip restoration if there's already an active timer (from Pomodoro)
    // Check if secondsRef has a value OR we already have seconds, indicating an active timer
    if ((hasStarted && secondsRef?.current && secondsRef.current > 0) || seconds > 0) {
      isInitializedRef.current = true;
      // If coming from Pomodoro with an active timer, set running state based on timerRunning
      // The running state is managed by RoomShell through onActiveChange
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
        
        // Also update secondsRef immediately
        if (secondsRef) {
          secondsRef.current = currentSeconds;
        }
        
        // Always restore the task associated with the timer
        if (timerState.taskId) {
          
          // First try to find in Redux
          const restoredTask = reduxTasks.find((t) => t.id === timerState.taskId);
          if (restoredTask) {
            console.log('[Timer] Restoring task from Redux:', {
              taskId: timerState.taskId,
              taskName: restoredTask.name,
              isRunning
            });
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
              onTaskRestore(restoredTask.name, isRunning);
            }
          } else {
            // If not in Redux yet, try to get from TaskBuffer
            const taskRef = ref(rtdb, `TaskBuffer/${user.id}/${timerState.taskId}`);
            get(taskRef).then((taskSnapshot) => {
              const taskData = taskSnapshot.val();
              if (taskData && taskData.name) {
                console.log('[Timer] Restoring task from TaskBuffer:', {
                  taskId: timerState.taskId,
                  taskName: taskData.name,
                  isRunning
                });
                // Check if task already exists in Redux before adding
                const existingTask = reduxTasks.find(t => t.id === timerState.taskId);
                if (!existingTask) {
                  console.log('[Timer] Adding task to Redux from TaskBuffer');
                  // Add task to Redux if not already there
                  dispatch(addTask({
                    id: timerState.taskId,
                    name: taskData.name
                  }));
                }
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
                  onTaskRestore(taskData.name, isRunning);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, reduxTasks, onTaskRestore, dispatch, hasStarted, task, secondsRef]); // Dependencies for initialization

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
      console.log('[Timer] beforeunload triggered:', { running, seconds, activeTaskId });
      // Save timer state if there are seconds accumulated (whether running or paused)
      if (seconds > 0 && activeTaskId) {
        // Save as paused state
        saveTimerState(false, seconds);
      }
      
      // Remove ActiveWorker if running
      if (running && user?.id) {
        const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
        remove(activeWorkerRef);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [running, seconds, task, saveTimerState, user?.id, activeTaskId]);

  async function startTimer() {
    await handleStart({
      task: task || "",
      seconds,
      isResume: seconds > 0,
      localVolume,
      onNewTaskStart,
      lastStartTime,
      saveTimerState,
      setRunning,
      setIsStarting,
      heartbeatIntervalRef,
    });
  }

  // Pause function using hook
  const pauseTimer = useCallback(() => {
    handleStop({
      task: task || "",
      seconds,
      saveTimerState,
      setRunning,
      setIsStarting,
      heartbeatIntervalRef,
    });
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

  // Update secondsRef with the current seconds value
  React.useEffect(() => {
    if (secondsRef) secondsRef.current = seconds;
  }, [seconds, secondsRef]);

  // Cleanup heartbeat on unmount
  React.useEffect(() => {
    const heartbeatInterval = heartbeatIntervalRef.current;
    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      
      // Don't remove ActiveWorker on unmount - let it persist across mode switches
      // ActiveWorker should only be removed when timer is explicitly stopped/completed
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 px-4 sm:px-0">
      <div className="text-3xl sm:text-4xl mb-2 font-mono">{formatTime(seconds)}</div>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md sm:max-w-none">
        {!running && !isStarting ? (
          <div className="flex flex-col items-center gap-2">
            <button
              className="bg-white text-black font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-105 disabled:opacity-40 w-full sm:w-auto cursor-pointer"
              onClick={startTimer}
              disabled={disabled || !requiredTask}
            >
              {seconds > 0 ? "Resume" : "Start"}
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
                className={`${showCompleteFeedback ? 'bg-green-600' : 'bg-green-500'} text-white font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-102 w-full sm:w-48 cursor-pointer`}
                onClick={completeTimer}
                disabled={isCompleting}
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
