"use client";
import React, { useEffect, useRef, useState } from "react";
import { useInstance } from "../../Components/Instances";
import { useDispatch, useSelector } from "react-redux";
import { setIsActive } from "../../store/realtimeSlice";
import { RootState, AppDispatch } from "../../store/store";
import type { DataSnapshot } from "firebase/database";
import {
  updateTask,
  transferTaskToPostgres,
  startTimeSegment,
  endTimeSegment,
  addTaskToBufferWhenStarted,
  addTask,
  createTaskThunk,
  setActiveTask,
} from "../../store/taskSlice";
import { rtdb } from "../../../lib/firebase";
import { ref, set, onValue, off, remove, update } from "firebase/database";
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
}) {
  const { currentInstance, user } = useInstance();
  const dispatch = useDispatch<AppDispatch>();
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const reduxUser = useSelector((state: RootState) => state.user);
  const [isStarting, setIsStarting] = useState(false);
  const isInitializedRef = useRef(false);
  const [showStillWorkingModal, setShowStillWorkingModal] = useState(false);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [modalCountdown, setModalCountdown] = useState(300); // 5 minutes
  const modalCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const [inactivityTimeout] = useState(3600); // Default 1 hour
  const inactivityDurationRef = useRef(3600); // Track timeout duration in ref to avoid effect re-runs
  const localVolumeRef = useRef(localVolume); // Track current volume for timeout callbacks
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      }
    },
    [reduxTasks, task, user?.id]
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

  // Listen for timer state changes from Firebase (for cross-tab sync and restoration)
  useEffect(() => {
    // Allow restoration even without a task initially
    if (!user?.id) {
      return;
    }

    const timerRef = ref(rtdb, `TaskBuffer/${user.id}/timer_state`);

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
        setIsStarting(false); // Clear starting state when loading from Firebase

        // If timer state has a taskId but no task is set, notify parent to restore it
        if (timerState.taskId && !task?.trim()) {
          const restoredTask = reduxTasks.find((t) => t.id === timerState.taskId);
          if (restoredTask && onTaskRestore) {
            onTaskRestore(restoredTask.name);
          }
        }
      } else if (isInitializedRef.current && task?.trim() && !running && !isStarting) {
        // Only reset if we were already initialized AND had a task AND not currently running or starting
        setSeconds(0);
        setRunning(false);
        setIsStarting(false);
      }

      isInitializedRef.current = true;
    };

    const handle = onValue(timerRef, handleTimerState);

    return () => {
      off(timerRef, "value", handle);
    };
  }, [task, user?.id, reduxTasks, onTaskRestore, running, isStarting]);

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

  // Keep inactivityDurationRef in sync with inactivityTimeout state
  useEffect(() => {
    inactivityDurationRef.current = inactivityTimeout;
  }, [inactivityTimeout]);

  // Update display every second when running (local only, no Firebase writes)
  useEffect(() => {
    if (running) {
      const interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
      return () => clearInterval(interval);
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

    // Don't start if set to "never"
    if (inactivityDurationRef.current === Infinity) {
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
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [running, seconds, task, saveTimerState]);

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

      // Start heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }

      heartbeatIntervalRef.current = setInterval(() => {
        update(heartbeatRef, { last_seen: Date.now() });
      }, 10000); // Update every 10 seconds
    }

    // Set running state AFTER all async operations
    setRunning(true);
    setIsStarting(false);

    // Small delay to ensure state is set before Firebase save
    setTimeout(() => {
      saveTimerState(true, seconds);
    }, 50);

    // Only play start sound if this is an initial start (not a resume)
    if (seconds === 0) {
      // Always play start sound locally
      const startAudio = new Audio("/started.mp3");
      startAudio.volume = localVolume;
      startAudio.play();

      // Sound cooldowns removed - not part of task data
      // Always notify for now
      notifyEvent("start");
    }
  }

  // Helper to move task to position #1 in task list (removed - task list not in TaskBuffer)
  const moveTaskToTop = React.useCallback(async (): Promise<void> => {
    // Task list operations should be handled through PostgreSQL
    // This is a no-op for now
    return Promise.resolve();
  }, []);

  // Helper to mark matching task as completed in task list (removed - task list not in TaskBuffer)
  const completeTaskInList = React.useCallback(async () => {
    // Task list operations should be handled through PostgreSQL
    // This is a no-op for now
  }, []);

  // Add event notification for start, complete, and quit
  function notifyEvent(type: "start" | "complete" | "quit") {
    if (currentInstance && user?.id) {
      const lastEventRef = ref(rtdb, `rooms/${currentInstance.id}/lastEvent`);
      set(lastEventRef, { displayName: user.displayName, userId: user.id, type, timestamp: Date.now() });
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
    if (inactivityDurationRef.current !== Infinity) {
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

  // Cleanup heartbeat on unmount
  React.useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 px-4 sm:px-0">
      <div className="text-3xl sm:text-4xl mb-2 font-mono">{formatTime(seconds)}</div>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md sm:max-w-none">
        {!running && !isStarting ? (
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
              onClick={async () => {
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
                      await dispatch(
                        transferTaskToPostgres({
                          taskId: activeTaskForTransfer.id,
                          firebaseUserId: user.id,
                          status: "completed",
                          token,
                          duration: seconds, // Pass the actual timer seconds
                        })
                      ).unwrap();


                    } catch (error: unknown) {
                      console.error("[COMPLETE] Failed to transfer task to Postgres:", error);
                      console.error("[COMPLETE] Error details:", {
                        message: (error as Error).message,
                        taskId: activeTaskForTransfer.id,
                        userId: user.id,
                        token: token ? "present" : "missing",
                      });

                      // Show error message to user
                      alert(`Failed to save task completion: ${(error as Error).message || "Unknown error"}`);
                    }
                  }
                }

                // Clear timer state and UI immediately
                // Clear heartbeat interval
                if (heartbeatIntervalRef.current) {
                  clearInterval(heartbeatIntervalRef.current);
                  heartbeatIntervalRef.current = null;
                }

                clearTimerState(); // Clear Firebase state when completing
                dispatch(setIsActive(false)); // Update Redux state

                // Call onComplete immediately to reset the input field
                if (onComplete) {
                  onComplete(completionTime);
                }

                // Always play completion sound locally
                const completeAudio = new Audio("/complete.mp3");
                completeAudio.volume = localVolume;
                completeAudio.play();

                // Only notify others if task took more than 15 seconds
                if (seconds > 15 && user?.id && currentInstance) {
                  // Always notify for completion
                  notifyEvent("complete");
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
              {inactivityTimeout < 60
                ? `${inactivityTimeout} second${inactivityTimeout !== 1 ? "s" : ""}`
                : inactivityTimeout < 3600
                ? `${Math.floor(inactivityTimeout / 60)} minute${Math.floor(inactivityTimeout / 60) !== 1 ? "s" : ""}`
                : `${Math.floor(inactivityTimeout / 3600)} hour${
                    Math.floor(inactivityTimeout / 3600) !== 1 ? "s" : ""
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
