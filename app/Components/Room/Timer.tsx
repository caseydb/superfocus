"use client";
import React, { useEffect, useRef, useState } from "react";
import { useInstance } from "../../Components/Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, set, onValue, off, remove, DataSnapshot } from "firebase/database";

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
}) {
  const { currentInstance, user } = useInstance();
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const isInitializedRef = useRef(false);
  const [showStillWorkingModal, setShowStillWorkingModal] = useState(false);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const [modalCountdown, setModalCountdown] = useState(300); // 5 minutes
  const modalCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const [inactivityTimeout, setInactivityTimeout] = useState(3600); // Default 1 hour
  const localVolumeRef = useRef(localVolume); // Track current volume for timeout callbacks

  // Helper to save timer state to Firebase (only on state changes, not every second)
  const saveTimerState = React.useCallback(
    (isRunning: boolean, baseSeconds: number = 0) => {
      if (currentInstance && user?.id) {
        const timerStateRef = ref(rtdb, `instances/${currentInstance.id}/userTimers/${user.id}`);
        const now = Date.now();

        if (isRunning) {
          // Store when timer started and base seconds
          set(timerStateRef, {
            running: true,
            startTime: now,
            baseSeconds: baseSeconds, // seconds accumulated before this start
            task: task || "",
            lastUpdate: now,
          });
        } else {
          // Store paused state with total accumulated seconds
          set(timerStateRef, {
            running: false,
            totalSeconds: baseSeconds,
            task: task || "",
            lastUpdate: now,
          });
        }
      }
    },
    [currentInstance, user?.id, task]
  );

  // Helper to clear timer state from Firebase
  const clearTimerState = React.useCallback(() => {
    if (currentInstance && user?.id) {
      const timerStateRef = ref(rtdb, `instances/${currentInstance.id}/userTimers/${user.id}`);
      remove(timerStateRef);
    }
  }, [currentInstance, user?.id]);

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

  // Listen for timer state changes from Firebase (for cross-tab sync)
  useEffect(() => {
    if (!currentInstance || !user?.id) {
      isInitializedRef.current = false;
      return;
    }

    const timerStateRef = ref(rtdb, `instances/${currentInstance.id}/userTimers/${user.id}`);

    const handleTimerState = (snapshot: DataSnapshot) => {
      const timerState = snapshot.val();

      if (timerState) {
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

        // Normal restoration - don't check user count here
        setSeconds(currentSeconds);
        setRunning(isRunning);
      } else if (isInitializedRef.current) {
        // Only reset if we were already initialized (not on first load)
        setSeconds(0);
        setRunning(false);
      }

      isInitializedRef.current = true;
    };

    const handle = onValue(timerStateRef, handleTimerState);

    return () => {
      off(timerStateRef, "value", handle);
    };
  }, [currentInstance, user?.id]);

  // Separate effect: Listen for user count changes and pause timer when room becomes empty
  useEffect(() => {
    if (!currentInstance || !user?.id) return;

    const usersRef = ref(rtdb, `instances/${currentInstance.id}/users`);

    const handleUserCountChange = (snapshot: DataSnapshot) => {
      const usersData = snapshot.val();
      const userCount = usersData ? Object.keys(usersData).length : 0;

      // If room becomes empty and timer is running, pause it immediately
      if (userCount === 0 && running) {
        setRunning(false);
        // Save paused state to Firebase
        saveTimerState(false, seconds);
      }
    };

    const handle = onValue(usersRef, handleUserCountChange);

    return () => {
      off(usersRef, "value", handle);
    };
  }, [currentInstance, user?.id, running, seconds, task, saveTimerState]);

  // Notify parent of running state
  useEffect(() => {
    if (onActiveChange) onActiveChange(running);
  }, [running, onActiveChange]);

  // Load user's inactivity timeout preference
  useEffect(() => {
    if (!user?.id) return;
    
    const prefsRef = ref(rtdb, `users/${user.id}/preferences`);
    const handle = onValue(prefsRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.inactivityTimeout !== undefined) {
        const timeoutValue = data.inactivityTimeout;
        if (timeoutValue === "never") {
          setInactivityTimeout(Infinity);
        } else {
          // Value is already in seconds
          setInactivityTimeout(parseInt(timeoutValue));
        }
      }
    });
    
    return () => off(prefsRef, "value", handle);
  }, [user?.id]);

  // Keep localVolumeRef in sync with localVolume prop
  useEffect(() => {
    localVolumeRef.current = localVolume;
  }, [localVolume]);

  // Update display every second when running (local only, no Firebase writes)
  useEffect(() => {
    if (running) {
      const interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [running]);

  // Inactivity detection
  useEffect(() => {
    if (!running || showStillWorkingModal) {
      // Clear any existing timeout when not running or modal already showing
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
      return;
    }

    // Don't start if set to "never"
    if (inactivityTimeout === Infinity) {
      return;
    }

    const resetInactivityTimer = () => {
      lastActivityRef.current = Date.now();
      
      // Clear existing timeout
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      
      // Set timeout based on user preference
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
      }, inactivityTimeout * 1000); // Convert seconds to milliseconds
    };

    // Track user activity
    const handleActivity = () => {
      // Don't reset timer if modal is already showing
      if (!showStillWorkingModal) {
        resetInactivityTimer();
      }
    };

    // Set initial timeout
    resetInactivityTimer();

    // Listen for various activity events
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('scroll', handleActivity);

    return () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [running, inactivityTimeout, showStillWorkingModal]);

  // Modal countdown effect
  useEffect(() => {
    if (showStillWorkingModal && modalCountdown > 0) {
      modalCountdownRef.current = setTimeout(() => {
        setModalCountdown(prev => prev - 1);
      }, 1000);
      
      return () => {
        if (modalCountdownRef.current) {
          clearTimeout(modalCountdownRef.current);
        }
      };
    } else if (showStillWorkingModal && modalCountdown === 0) {
      // Auto-pause when countdown reaches 0
      setShowStillWorkingModal(false);
      handleStop();
    }
  }, [showStillWorkingModal, modalCountdown]);

  // Pause timer when user leaves the page (closes tab, refreshes, or navigates away)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (running) {
        // Pause the timer and save state to Firebase
        saveTimerState(false, seconds);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [running, seconds, task, saveTimerState]);

  async function handleStart() {
    // Move task to position #1 in task list BEFORE starting timer
    if (task && task.trim() && user?.id) {
      await moveTaskToTop(task.trim());
      // Small delay to ensure TaskList component receives the update
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    setRunning(true);
    saveTimerState(true, seconds); // Save start state to Firebase
    
    // Only play start sound if this is an initial start (not a resume)
    if (seconds === 0) {
      // Always play start sound locally
      const startAudio = new Audio("/started.mp3");
      startAudio.volume = localVolume;
      startAudio.play();
      
      // Check if we should notify others (with cooldown)
      if (user?.id && currentInstance) {
        const now = Date.now();
        const lastStartRef = ref(rtdb, `instances/${currentInstance.id}/lastStartSound/${user.id}`);
        
        // Check last start sound timestamp
        onValue(lastStartRef, (snapshot) => {
          const lastStartTime = snapshot.val() || 0;
          const timeSinceLastStart = now - lastStartTime;
          
          if (timeSinceLastStart > 600000) { // 10 minutes cooldown for others
            notifyEvent("start");
            set(lastStartRef, now);
          }
        }, { onlyOnce: true });
      }
    }
  }

  // Helper to move task to position #1 in task list (add if doesn't exist, move if exists)
  const moveTaskToTop = React.useCallback(
    async (taskText: string): Promise<void> => {
      if (!user?.id) return;

      const tasksRef = ref(rtdb, `users/${user.id}/tasks`);

      return new Promise((resolve) => {
        // Get current tasks and move/add the task to position #1
        onValue(
          tasksRef,
          (snapshot) => {
            const tasksData = snapshot.val();
            const updates: Record<string, { text: string; completed: boolean; order: number }> = {};

            // Find if task already exists
            let existingTaskId: string | null = null;
            if (tasksData) {
              existingTaskId =
                Object.keys(tasksData).find((taskId) => {
                  const task = tasksData[taskId];
                  return task.text === taskText && !task.completed;
                }) || null;
            }

            // Increment order of all other tasks
            if (tasksData) {
              Object.keys(tasksData).forEach((taskId) => {
                if (taskId !== existingTaskId) {
                  const existingTask = tasksData[taskId];
                  updates[taskId] = {
                    text: existingTask.text,
                    completed: existingTask.completed,
                    order: (existingTask.order || 0) + 1,
                  };
                }
              });
            }

            // Add/move the target task to position 0
            const targetTaskId = existingTaskId || Date.now().toString();
            updates[targetTaskId] = {
              text: taskText,
              completed: false,
              order: 0,
            };

            // Update all tasks at once and resolve promise
            set(tasksRef, updates).then(() => resolve());
          },
          { onlyOnce: true }
        );
      });
    },
    [user?.id]
  );

  // Helper to mark matching task as completed in task list
  const completeTaskInList = React.useCallback(
    async (taskText: string) => {
      if (!user?.id || !taskText.trim()) return;

      const tasksRef = ref(rtdb, `users/${user.id}/tasks`);

      // Find and complete the matching task
      onValue(
        tasksRef,
        (snapshot) => {
          const tasksData = snapshot.val();
          if (tasksData) {
            // Find the first incomplete task that matches the text
            const matchingTaskId = Object.keys(tasksData).find((taskId) => {
              const taskItem = tasksData[taskId];
              return taskItem.text === taskText && !taskItem.completed;
            });

            if (matchingTaskId) {
              const taskRef = ref(rtdb, `users/${user.id}/tasks/${matchingTaskId}`);
              const matchingTask = tasksData[matchingTaskId];
              set(taskRef, {
                ...matchingTask,
                completed: true,
              });
            }
          }
        },
        { onlyOnce: true }
      );
    },
    [user?.id]
  );

  // Add event notification for start, complete, and quit
  function notifyEvent(type: "start" | "complete" | "quit") {
    if (currentInstance) {
      const lastEventRef = ref(rtdb, `instances/${currentInstance.id}/lastEvent`);
      set(lastEventRef, { displayName: user.displayName, type, timestamp: Date.now() });
    }
  }

  function handleStop() {
    setRunning(false);
    saveTimerState(false, seconds); // Save paused state to Firebase
  }

  // Handle "Yes, still working" response
  const handleStillWorking = () => {
    setShowStillWorkingModal(false);
    setModalCountdown(300); // Reset countdown to 5 minutes for next time
    // Reset the inactivity timer
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }
    // Start a new inactivity timer based on user preference
    if (inactivityTimeout !== Infinity) {
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
      }, inactivityTimeout * 1000);
    }
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

  return (
    <div className="flex flex-col items-center gap-4 px-4 sm:px-0">
      <div className="text-3xl sm:text-4xl mb-2 font-mono">{formatTime(seconds)}</div>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md sm:max-w-none">
        {!running ? (
          <button
            className="bg-white text-black font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-105 disabled:opacity-40 w-full sm:w-auto cursor-pointer"
            onClick={handleStart}
            disabled={disabled || !requiredTask}
          >
            {seconds > 0 ? "Resume" : "Start"}
          </button>
        ) : (
          <>
            <button
              className="bg-white text-black font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-102 disabled:opacity-40 w-full sm:w-48 cursor-pointer"
              onClick={handleStop}
            >
              Pause
            </button>
            <button
              className="bg-green-500 text-white font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-102 disabled:opacity-40 w-full sm:w-48 cursor-pointer"
              onClick={() => {
                const completionTime = formatTime(seconds);

                // Mark matching task as completed in task list
                if (task && task.trim()) {
                  completeTaskInList(task.trim());
                }

                // Mark today as completed for streak tracking
                if (typeof window !== "undefined") {
                  const windowWithStreak = window as Window & { markStreakComplete?: () => Promise<void> };
                  if (windowWithStreak.markStreakComplete) {
                    windowWithStreak.markStreakComplete();
                  }
                }

                clearTimerState(); // Clear Firebase state when completing - this will trigger the listener to reset local state
                
                // Always play completion sound locally
                const completeAudio = new Audio("/complete.mp3");
                completeAudio.volume = localVolume;
                completeAudio.play();
                
                // Only notify others if task took more than 15 seconds AND cooldown has passed
                if (seconds > 15 && user?.id && currentInstance) {
                  const now = Date.now();
                  const lastCompleteRef = ref(rtdb, `instances/${currentInstance.id}/lastCompleteSound/${user.id}`);
                  
                  // Check last complete sound timestamp
                  onValue(lastCompleteRef, (snapshot) => {
                    const lastCompleteTime = snapshot.val() || 0;
                    const timeSinceLastComplete = now - lastCompleteTime;
                    
                    if (timeSinceLastComplete > 300000) { // 5 minutes cooldown
                      notifyEvent("complete");
                      set(lastCompleteRef, now);
                    }
                  }, { onlyOnce: true });
                }
                
                if (onComplete) {
                  onComplete(completionTime);
                }
              }}
            >
              Complete
            </button>
          </>
        )}
      </div>
      
      {/* Still Working Modal */}
      {showStillWorkingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-[#181A1B] rounded-2xl shadow-2xl p-8 w-full max-w-md border border-[#23272b] relative">
            {/* Elegant countdown circle */}
            <div className="absolute top-4 right-4 w-14 h-14">
              <svg className="w-14 h-14 transform -rotate-90" viewBox="0 0 64 64">
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  stroke="#374151"
                  strokeWidth="4"
                  fill="none"
                />
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
                    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                  } else {
                    return seconds.toString();
                  }
                })()}
              </span>
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-4 text-center">Are you still working?</h2>
            <p className="text-gray-300 mb-6 text-center">
              Your timer has been going for {inactivityTimeout < 60 ? `${inactivityTimeout} second${inactivityTimeout !== 1 ? 's' : ''}` : inactivityTimeout < 3600 ? `${Math.floor(inactivityTimeout / 60)} minute${Math.floor(inactivityTimeout / 60) !== 1 ? 's' : ''}` : `${Math.floor(inactivityTimeout / 3600)} hour${Math.floor(inactivityTimeout / 3600) !== 1 ? 's' : ''}`}. Are you still working on &quot;{task}&quot;?
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
