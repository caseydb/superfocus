"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useStartButton } from "../../hooks/StartButton";
import { usePauseButton } from "../../hooks/PauseButton";
import { useCompleteButton } from "../../hooks/CompleteButton";
import { useInstance } from "../Instances";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../store/store";
import { rtdb } from "../../../lib/firebase";
import { ref, remove, onDisconnect, set } from "firebase/database";
import { setCurrentInput, lockInput, unlockInput, setHasStarted, resetInput } from "../../store/taskInputSlice";

interface PomodoroProps {
  localVolume?: number;
  onActiveChange?: (isActive: boolean) => void;
  onNewTaskStart?: () => void;
  onComplete?: (duration: string) => void;
  startRef?: React.RefObject<() => void>;
  pauseRef?: React.RefObject<() => void>;
  secondsRef?: React.RefObject<number>;
  lastStartTime?: number;
  initialRunning?: boolean;
  onClearClick?: () => void;
  setShowTaskList?: (show: boolean) => void;
}

export default function Pomodoro({
  localVolume = 0.2,
  onActiveChange,
  onNewTaskStart,
  onComplete,
  startRef,
  pauseRef,
  secondsRef,
  lastStartTime = 0,
  initialRunning = false,
  onClearClick,
  setShowTaskList,
}: PomodoroProps) {
  const dispatch = useDispatch();
  const { user } = useInstance();
  const { currentInput: task, isLocked: inputLocked, hasStarted } = useSelector((state: RootState) => state.taskInput);
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const preferences = useSelector((state: RootState) => state.preferences);

  // Use button hooks
  const { handleStart } = useStartButton();
  const { handleStop } = usePauseButton();
  const { handleComplete, showCompleteFeedback } = useCompleteButton();

  // State management
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedMinutes, setSelectedMinutes] = useState(30);
  const [totalSeconds, setTotalSeconds] = useState(30 * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(30 * 60);
  const [elapsedSeconds, setElapsedSeconds] = useState(secondsRef?.current || 0);
  const [isRunning, setIsRunning] = useState(initialRunning);
  const [isPaused, setIsPaused] = useState(false);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editingMinutes, setEditingMinutes] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showTaskSuggestions, setShowTaskSuggestions] = useState(false);
  const [showNoTaskFeedback, setShowNoTaskFeedback] = useState(false);
  
  // Filter out completed tasks and sort by most recent
  const availableTasks = reduxTasks
    .filter((t) => t.status !== "completed" && t.name && t.name.trim())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
  // Filter tasks based on current input
  const filteredTasks = task.trim()
    ? availableTasks.filter((t) => 
        t.name.toLowerCase().includes(task.toLowerCase().trim())
      )
    : availableTasks;

  // Preset time options
  const timePresets = [
    { label: "10 min", minutes: 10 },
    { label: "20 min", minutes: 20 },
    { label: "30 min", minutes: 30 },
    { label: "45 min", minutes: 45 },
    { label: "60 min", minutes: 60 },
  ];

  // Update total and remaining seconds when selected minutes change
  useEffect(() => {
    if (!isRunning && !isPaused) {
      const seconds = selectedMinutes * 60;
      setTotalSeconds(seconds);
      setRemainingSeconds(seconds);
    }
  }, [selectedMinutes, isRunning, isPaused]);

  // Countdown timer
  useEffect(() => {
    if (isRunning && remainingSeconds > 0) {
      const interval = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isRunning, remainingSeconds]);

  // Auto-complete when timer reaches zero
  useEffect(() => {
    if (isRunning && remainingSeconds === 0) {
      if (task.trim()) {
        completeTimer();
      } else {
        setIsRunning(false);
        dispatch(setHasStarted(false));
        dispatch(unlockInput());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, remainingSeconds, task, dispatch]);

  // Notify parent of running state
  useEffect(() => {
    if (onActiveChange) onActiveChange(isRunning);
  }, [isRunning, onActiveChange]);

  // Sync with shared secondsRef on mount and when switching between running states
  useEffect(() => {
    // Read from secondsRef when component first mounts or when not actively counting
    if (secondsRef?.current !== undefined && !isRunning) {
      setElapsedSeconds(secondsRef.current);
    }
  }, [isRunning, secondsRef]); // Update when running state changes

  // Update secondsRef with elapsed seconds
  useEffect(() => {
    if (secondsRef) secondsRef.current = elapsedSeconds;
  }, [elapsedSeconds, secondsRef]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [task]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatElapsedTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleTimeEdit = () => {
    if (!isRunning && !isPaused) {
      setIsEditingTime(true);
      const currentMinutes = Math.floor(remainingSeconds / 60);
      setEditingMinutes(currentMinutes.toString());
    }
  };

  const handleTimeEditSubmit = () => {
    const minutes = parseInt(editingMinutes) || 0;

    // Limit to reasonable range (1 to 180 minutes)
    const validMinutes = Math.max(1, Math.min(180, minutes));

    setSelectedMinutes(validMinutes);
    setTotalSeconds(validMinutes * 60);
    setRemainingSeconds(validMinutes * 60);
    setIsEditingTime(false);
  };

  // Helper functions for timer state - Pomodoro SHOULD save to Firebase for persistence
  const saveTimerState = React.useCallback(
    (isRunning: boolean, baseSeconds: number = 0) => {
      // Use activeTaskId if available, otherwise find by name
      let taskId = activeTaskId;
      if (!taskId) {
        const activeTask = reduxTasks.find((t) => t.name === task?.trim());
        taskId = activeTask?.id || null;
      }
      
      console.log('[Pomodoro] saveTimerState called:', { taskId, isRunning, baseSeconds, activeTaskId });
      
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
      }
    },
    [reduxTasks, task, user?.id, activeTaskId]
  );

  const clearTimerState = React.useCallback(() => {
    if (user?.id) {
      const timerRef = ref(rtdb, `TaskBuffer/${user.id}/timer_state`);
      remove(timerRef);
      
      // Also remove ActiveWorker
      const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
      remove(activeWorkerRef);
    }
  }, [user?.id]);

  // Save timer state when user leaves the page (closes tab, refreshes, or navigates away)
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('[Pomodoro] beforeunload triggered:', { isRunning, elapsedSeconds, activeTaskId });
      // Save timer state if there are seconds accumulated (whether running or paused)
      if (elapsedSeconds > 0 && activeTaskId) {
        // Save as paused state with current elapsed seconds
        saveTimerState(false, elapsedSeconds);
      }
      
      // Remove ActiveWorker if running
      if (isRunning && user?.id) {
        const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
        remove(activeWorkerRef);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isRunning, elapsedSeconds, saveTimerState, user?.id, activeTaskId]);

  const startTimer = async () => {
    if (!task.trim()) return;

    // Close dropdown when starting
    setShowTaskSuggestions(false);

    await handleStart({
      task,
      seconds: elapsedSeconds,
      isResume: isPaused,
      localVolume,
      onNewTaskStart,
      lastStartTime,
      saveTimerState,
      setRunning: setIsRunning,
      setIsStarting,
      heartbeatIntervalRef,
    });

    setIsPaused(false);
    dispatch(setHasStarted(true));
    dispatch(lockInput());
  };

  const pauseTimer = () => {
    handleStop({
      task,
      seconds: elapsedSeconds,
      saveTimerState,
      setRunning: setIsRunning,
      setIsStarting,
      heartbeatIntervalRef,
    });

    setIsPaused(true);
  };

  const resumeTimer = async () => {
    await startTimer();
  };

  const completeTimer = useCallback(async () => {
    try {
      await handleComplete({
        task,
        seconds: elapsedSeconds,
        localVolume,
        clearTimerState,
        onComplete,
        setIsCompleting,
        heartbeatIntervalRef,
      });
    } finally {
      // Always reset Pomodoro state, even if complete fails
      setIsRunning(false);
      setIsPaused(false);
      dispatch(resetInput());
      setRemainingSeconds(totalSeconds);
      setElapsedSeconds(0);
    }
  }, [handleComplete, task, elapsedSeconds, localVolume, clearTimerState, onComplete, heartbeatIntervalRef, dispatch, totalSeconds]);

  const handleClear = () => {
    // If there are elapsed seconds and onClearClick is provided, use it (triggers quit modal)
    if (elapsedSeconds > 0 && onClearClick) {
      onClearClick();
      return;
    }

    // Otherwise, just clear without quit modal
    // Clean up any active work
    if (user?.id) {
      const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
      remove(activeWorkerRef);
      onDisconnect(activeWorkerRef).cancel();
    }

    // Clear heartbeat interval
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    setIsRunning(false);
    setIsPaused(false);
    dispatch(resetInput());
    setRemainingSeconds(totalSeconds);
    setElapsedSeconds(0);
    setShowTaskSuggestions(false);
  };

  // Expose functions to parent via refs
  useEffect(() => {
    if (startRef) {
      startRef.current = startTimer;
    }
  });

  useEffect(() => {
    if (pauseRef) {
      pauseRef.current = pauseTimer;
    }
  });


  return (
    <div className="flex flex-col items-center gap-4 px-4 sm:px-0 w-full mx-auto -mt-10">
      {/* Task input field - matching Timer styling */}
      <div className="relative group">
        <div className="flex flex-col items-center justify-center w-full px-4 sm:px-0">
          <textarea
          ref={textareaRef}
          value={task}
          onChange={(e) => {
            const newValue = e.target.value;
            if (newValue.length <= 69) {
              dispatch(setCurrentInput(newValue));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && task.trim() && !isRunning && !isPaused) {
              e.preventDefault();
              startTimer();
            }
          }}
          onFocus={() => {
            setInputFocused(true);
            // Show dropdown if in dropdown mode and there are tasks to show (but not when disabled)
            if (preferences.task_selection_mode === "dropdown" && filteredTasks.length > 0 && !inputLocked) {
              setShowTaskSuggestions(true);
            } else if (preferences.task_selection_mode === "sidebar" && setShowTaskList && !task.trim() && !inputLocked) {
              setShowTaskList(true);
              // Keep focus on this input when opening sidebar
              setTimeout(() => {
                textareaRef.current?.focus();
              }, 50);
            }
          }}
          onBlur={() => {
            setInputFocused(false);
            // Hide dropdown after a small delay to allow clicks on suggestions
            setTimeout(() => {
              setShowTaskSuggestions(false);
            }, 200);
          }}
          onClick={() => {
            // Show suggestions when clicking, even if already focused (but not when disabled)
            if (preferences.task_selection_mode === "dropdown" && filteredTasks.length > 0 && !inputLocked) {
              setShowTaskSuggestions(true);
            } else if (preferences.task_selection_mode === "sidebar" && setShowTaskList && !task.trim() && !inputLocked) {
              setShowTaskList(true);
              // Keep focus on this input when opening sidebar
              setTimeout(() => {
                textareaRef.current?.focus();
              }, 50);
            }
          }}
          placeholder="What are you focusing on?"
          disabled={inputLocked}
          maxLength={69}
          className={`text-center text-2xl md:text-3xl font-semibold outline-none text-white mb-4 leading-tight mx-auto overflow-hidden resize-none transition-all duration-200 w-full ${
            inputLocked ? "cursor-not-allowed" : "bg-transparent"
          }`}
          style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif", minWidth: "400px", maxWidth: "600px" }}
          rows={1}
        />
        {/* Custom underline */}
        <div
          className={`mx-auto transition-all duration-200 ${
            showNoTaskFeedback 
              ? "bg-[#FFAA00] animate-pulse" 
              : inputFocused && !inputLocked 
                ? "bg-[#FFAA00]" 
                : "bg-gray-700"
          }`}
          style={{
            width: "100%",
            minWidth: "400px",
            maxWidth: "600px",
            height: showNoTaskFeedback ? "3px" : "2px",
            marginBottom: "16px",
            borderRadius: "2px",
          }}
        />
        </div>
        {/* No task feedback message */}
        {showNoTaskFeedback && (
          <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 text-[#FFAA00] text-sm font-medium animate-in fade-in duration-200">
            Add a task first
          </div>
        )}
        {/* Clear button in top-right - matching Timer's positioning */}
        {task.trim() && hasStarted && (
          <button
            className={`absolute -top-6 right-0 text-gray-400 text-sm font-mono underline underline-offset-4 select-none hover:text-[#FFAA00] transition-all px-2 py-1 bg-transparent border-none cursor-pointer z-10 opacity-0 group-hover:opacity-100`}
            onClick={handleClear}
          >
            Clear
          </button>
        )}
        
        {/* Task suggestions dropdown */}
        {showTaskSuggestions && filteredTasks.length > 0 && (
          <div
            className="absolute mt-2 p-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200 custom-scrollbar"
            style={{
              width: "400px",
              maxWidth: "90vw",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginTop: "8px",
              maxHeight: "240px",
              overflowY: "auto",
            }}
          >
            <div className="text-xs text-gray-400 mb-2 px-2 font-mono">
              {task.trim() ? `Tasks matching "${task}":` : "Choose from existing tasks:"}
            </div>
            <div className="space-y-1">
              {filteredTasks.map((taskItem) => (
                <button
                  key={taskItem.id}
                  onClick={() => {
                    dispatch(setCurrentInput(taskItem.name));
                    setShowTaskSuggestions(false);
                    textareaRef.current?.focus();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg transition-colors text-white text-sm truncate font-mono border border-transparent hover:bg-gray-800 hover:border-[#FFAA00]/30"
                >
                  {taskItem.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Countdown Display */}
      <div className="relative w-72 h-72 sm:w-96 sm:h-96">
        {/* Circle SVG - bigger and thinner */}
        <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 256 256">
          {/* Background circle */}
          <circle cx="128" cy="128" r="115" stroke="#374151" strokeWidth="4" fill="none" />
          {/* Progress circle - starts full and empties as time runs out */}
          <circle
            cx="128"
            cy="128"
            r="115"
            stroke="#FFAA00"
            strokeWidth="4"
            fill="none"
            strokeDasharray={`${(remainingSeconds / totalSeconds) * 722.57} 722.57`}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* Main countdown - editable when not running */}
          <div
            className={`text-5xl sm:text-7xl font-bold text-white mb-2 ${
              !isRunning && !isPaused && !isEditingTime ? "cursor-text hover:text-[#FFAA00] transition-colors" : ""
            } ${isEditingTime ? "border-b-2 border-[#FFAA00]" : ""}`}
            onClick={handleTimeEdit}
            title={!isRunning && !isPaused ? "Click to edit time" : ""}
            style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}
          >
            {isEditingTime ? (
              <div className="flex items-baseline">
                <input
                  type="text"
                  value={editingMinutes.padStart(2, "0")}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" || e.key === "Delete") {
                      e.preventDefault();
                      const currentValue = editingMinutes.padStart(2, "0");
                      // Shift right and add 0: "45" -> "04"
                      const shiftedValue = "0" + currentValue.slice(0, 1);
                      setEditingMinutes(shiftedValue.replace(/^0+/, "") || "0");
                    } else if (e.key === "Enter") {
                      handleTimeEditSubmit();
                    } else if (e.key === "Escape") {
                      setIsEditingTime(false);
                      setEditingMinutes("");
                    } else if (/^\d$/.test(e.key)) {
                      e.preventDefault();
                      const currentValue = editingMinutes.padStart(2, "0");
                      // Shift left and add new digit: "04" + "5" -> "45"
                      const shiftedValue = currentValue.slice(1) + e.key;
                      setEditingMinutes(shiftedValue.replace(/^0+/, "") || "0");
                    }
                  }}
                  onChange={() => {
                    // Prevent any changes - all input is handled in onKeyDown
                  }}
                  onBlur={handleTimeEditSubmit}
                  className="w-20 sm:w-24 bg-transparent text-white text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="25"
                  autoFocus
                  maxLength={3}
                  style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}
                />
                <span>:{(remainingSeconds % 60).toString().padStart(2, "0")}</span>
              </div>
            ) : (
              formatTime(remainingSeconds)
            )}
          </div>

          {/* Time presets inside circle - only show when not running */}
          {!isRunning && !isPaused && (
            <div className="flex flex-wrap justify-center gap-2 mt-6 px-4">
              {timePresets.map((preset) => (
                <button
                  key={preset.minutes}
                  onClick={() => setSelectedMinutes(preset.minutes)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer ${
                    (isEditingTime ? parseInt(editingMinutes) || 0 : Math.floor(remainingSeconds / 60)) ===
                    preset.minutes
                      ? "bg-[#FFAA00] text-black hover:bg-[#FFB833]"
                      : "bg-gray-800/50 text-gray-400 hover:bg-gray-700 hover:text-white"
                  }`}
                  style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}
                >
                  {preset.minutes}
                </button>
              ))}
            </div>
          )}

          {/* Subtle elapsed time counter - always show inside circle */}
          <div className={`text-sm text-gray-500 ${!isRunning && !isPaused ? "mt-4" : "mt-6"}`} style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}>
            Total time: {formatElapsedTime(elapsedSeconds)}
          </div>
        </div>
      </div>

      {/* Control buttons */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md sm:max-w-none justify-center mt-4">
        {!isRunning && !isPaused && (
          <div className="flex flex-col items-center gap-2">
            <button
              className={`bg-white text-black font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-105 w-full sm:w-auto cursor-pointer ${
                !task.trim() ? "opacity-60" : ""
              }`}
              onClick={() => {
                if (!task.trim()) {
                  setShowNoTaskFeedback(true);
                  // Flash the input field
                  textareaRef.current?.focus();
                  setTimeout(() => setShowNoTaskFeedback(false), 2000);
                } else if (!isStarting) {
                  startTimer();
                }
              }}
            >
              {elapsedSeconds > 0 ? "Resume" : "Start"}
            </button>
          </div>
        )}

        {isRunning && (
          <>
            <button
              className="bg-white text-black font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-102 disabled:opacity-40 w-full sm:w-48 cursor-pointer"
              onClick={pauseTimer}
            >
              Pause
            </button>
            <div className="flex flex-col items-center gap-2">
              <button
                className={`${
                  showCompleteFeedback ? "bg-green-600" : "bg-green-500"
                } text-white font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-102 w-full sm:w-48 cursor-pointer`}
                onClick={completeTimer}
                disabled={isCompleting}
              >
                {showCompleteFeedback ? "Wait..." : "Complete"}
              </button>
            </div>
          </>
        )}

        {isPaused && (
          <div className="flex flex-col items-center gap-2">
            <button
              className="bg-white text-black font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-105 disabled:opacity-40 w-full sm:w-auto cursor-pointer"
              onClick={resumeTimer}
              disabled={isStarting}
            >
              Resume
            </button>
          </div>
        )}
      </div>


    </div>
  );
}
