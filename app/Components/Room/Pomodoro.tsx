"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useStartButton } from "../../hooks/StartButton";
import { usePauseButton } from "../../hooks/PauseButton";
import { useCompleteButton } from "../../hooks/CompleteButton";
import { useInstance } from "../Instances";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { rtdb } from "../../../lib/firebase";
import { ref, remove, set, update, get } from "firebase/database";
import { setCurrentInput, lockInput, setHasStarted, resetInput } from "../../store/taskInputSlice";
import { setActiveTask } from "../../store/taskSlice";
import { setPreference, updatePreferences } from "../../store/preferenceSlice";

interface PomodoroProps {
  localVolume?: number;
  onActiveChange?: (isActive: boolean) => void;
  onNewTaskStart?: () => void;
  onComplete?: (duration: string) => void;
  startRef?: React.RefObject<() => void>;
  pauseRef?: React.RefObject<() => void>;
  secondsRef?: React.RefObject<number>;
  remainingRef?: React.RefObject<number>;
  lastStartTime?: number;
  initialRunning?: boolean;
  onClearClick?: () => void;
  setShowTaskList?: (show: boolean) => void;
  onTaskRestore?: (taskName: string, isRunning: boolean, taskId?: string) => void;
  isCompact?: boolean;
  showNotes?: boolean;
  notesContent?: React.ReactNode;
  onNotesToggle?: () => void;
}

export default function Pomodoro({
  localVolume = 0.2,
  onActiveChange,
  onNewTaskStart,
  onComplete,
  startRef,
  pauseRef,
  secondsRef,
  remainingRef,
  lastStartTime = 0,
  initialRunning = false,
  onClearClick,
  setShowTaskList,
  onTaskRestore,
  isCompact = false,
  showNotes = false,
  notesContent,
  onNotesToggle,
}: PomodoroProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useInstance();
  const { currentInput: task, isLocked: inputLocked, hasStarted } = useSelector((state: RootState) => state.taskInput);
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const preferences = useSelector((state: RootState) => state.preferences);
  const postgresUserId = useSelector((state: RootState) => state.user.user_id);

  // Use button hooks
  const { handleStart } = useStartButton();
  const { handleStop } = usePauseButton();
  const { handleComplete, showCompleteFeedback } = useCompleteButton();

  // State management
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedMinutes, setSelectedMinutes] = useState(preferences.pomodoro_duration);
  const [totalSeconds, setTotalSeconds] = useState(preferences.pomodoro_duration * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(preferences.pomodoro_duration * 60);
  const [elapsedSeconds, setElapsedSeconds] = useState(secondsRef?.current || 0);
  const [isRunning, setIsRunning] = useState(initialRunning);
  const [isPaused, setIsPaused] = useState(false);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editingMinutes, setEditingMinutes] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showTaskSuggestions, setShowTaskSuggestions] = useState(false);
  const [showNoTaskFeedback, setShowNoTaskFeedback] = useState(false);
  const hasPlayedZeroNotificationRef = useRef(false);
  const isInitializedRef = useRef(false);
  const [underlineWidth, setUnderlineWidth] = useState<string>("340px"); // Default to placeholder width
  const hiddenSpanRef = useRef<HTMLSpanElement>(null); // To measure text width
  
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
    { label: "5 min", minutes: 5 },
    { label: "15 min", minutes: 15 },
    { label: "30 min", minutes: 30 },
    { label: "45 min", minutes: 45 },
    { label: "60 min", minutes: 60 },
  ];

  // Sync with Redux preference on mount and when preference changes
  useEffect(() => {
    if (!isRunning && !isPaused && preferences.pomodoro_duration !== selectedMinutes) {
      setSelectedMinutes(preferences.pomodoro_duration);
      const seconds = preferences.pomodoro_duration * 60;
      setTotalSeconds(seconds);
      setRemainingSeconds(seconds);
    }
  }, [preferences.pomodoro_duration, isRunning, isPaused, selectedMinutes]);

  // Update total and remaining seconds when selected minutes change
  useEffect(() => {
    if (!isRunning && !isPaused) {
      const seconds = selectedMinutes * 60;
      setTotalSeconds(seconds);
      setRemainingSeconds(seconds);
    }
  }, [selectedMinutes, isRunning, isPaused]);

  // One-time restoration from Firebase on mount
  useEffect(() => {
    if (!user?.id || isInitializedRef.current) {
      return;
    }

    // Skip restoration if there's already an active timer
    if ((hasStarted && secondsRef?.current && secondsRef.current > 0) || elapsedSeconds > 0) {
      isInitializedRef.current = true;
      return;
    }

    // Wait a bit to ensure Redux has loaded tasks
    const initTimer = setTimeout(async () => {
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
          
          // Set the elapsed seconds to this task's time
          setElapsedSeconds(totalTime);
          if (secondsRef) {
            secondsRef.current = totalTime;
          }
          
          // Set this as the active task
          dispatch(setActiveTask(lastTaskData.taskId));
          
          // Restore the task name in the input
          if (onTaskRestore) {
            onTaskRestore(lastTaskData.taskName || taskData.name, false, lastTaskData.taskId);
          }
          
          // Mark as initialized
          isInitializedRef.current = true;
        }
      }
    }, 500);

    return () => clearTimeout(initTimer);
  }, [user?.id, hasStarted, secondsRef, elapsedSeconds, dispatch, onTaskRestore]);

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
        setElapsedSeconds((prev) => {
          const newElapsed = prev + 1;
          
          // Save total_time to Firebase every 5 seconds (matching Timer.tsx logic)
          if (newElapsed % 5 === 0 && activeTaskId && user?.id) {
            const taskRef = ref(rtdb, `TaskBuffer/${user.id}/${activeTaskId}`);
            update(taskRef, {
              total_time: newElapsed,
              updated_at: Date.now()
            }).catch(() => {
              console.log('[Pomodoro] Failed to update task time - task may have been quit');
            });
            
            // Also update LastTask to ensure it's current
            const lastTaskRef = ref(rtdb, `TaskBuffer/${user.id}/LastTask`);
            set(lastTaskRef, {
              taskId: activeTaskId,
              taskName: task || "",
              timestamp: Date.now()
            });
          }
          
          return newElapsed;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isRunning, remainingSeconds, activeTaskId, user?.id, task]);

  // Auto-pause when timer reaches zero
  useEffect(() => {
    if (isRunning && remainingSeconds === 0) {
      // Pause the timer instead of completing
      pauseTimer();
      // Keep the timer at 00:00 instead of resetting
      // Play a gentle notification sound only if we haven't played it yet
      if (localVolume > 0 && !hasPlayedZeroNotificationRef.current) {
        const notificationAudio = new Audio("/inactive.mp3");
        notificationAudio.volume = localVolume;
        notificationAudio.play();
        hasPlayedZeroNotificationRef.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, remainingSeconds, totalSeconds, localVolume]);

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

  // Update secondsRef and ref with elapsed seconds
  useEffect(() => {
    if (secondsRef) secondsRef.current = elapsedSeconds;
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds, secondsRef]);

  // Update remainingRef with remaining seconds
  useEffect(() => {
    if (remainingRef) remainingRef.current = remainingSeconds;
  }, [remainingSeconds, remainingRef]);

  // Store previous activeTaskId to detect actual task changes
  const previousActiveTaskIdRef = useRef<string | null>(null);
  const elapsedSecondsRef = useRef(elapsedSeconds);
  
  // Watch for active task changes and load the task's accumulated time
  useEffect(() => {
    const previousTaskId = previousActiveTaskIdRef.current;
    
    if (!activeTaskId) {
      // Reset everything when no task is active (after quit)
      setElapsedSeconds(0);
      if (secondsRef) {
        secondsRef.current = 0;
      }
      // STOP the timer when no task is active
      setIsRunning(false);
      setIsPaused(false);
      // Reset the Pomodoro countdown
      setRemainingSeconds((prevSeconds) => {
        // Only reset if it's different from totalSeconds
        return prevSeconds !== totalSeconds ? totalSeconds : prevSeconds;
      });
      previousActiveTaskIdRef.current = activeTaskId;
      return;
    }
    
    // Check if this is actually a task change
    const isTaskChange = previousTaskId !== activeTaskId;
    
    // Only process if it's an actual task change
    if (!isTaskChange) {
      return;
    }
    
    // If timer was running and we had a previous task, save its time first
    if (isRunning && previousTaskId && user?.id && elapsedSecondsRef.current > 0) {
      const previousTaskRef = ref(rtdb, `TaskBuffer/${user.id}/${previousTaskId}`);
      update(previousTaskRef, {
        total_time: elapsedSecondsRef.current,
        updated_at: Date.now()
      }).then(() => {
        console.log('[Pomodoro] Saved time for previous task before switching:', previousTaskId, elapsedSecondsRef.current);
      }).catch(() => {
        console.log('[Pomodoro] Failed to save previous task time');
      });
    }
    
    // Update the ref to the new task
    previousActiveTaskIdRef.current = activeTaskId;
    
    // Always load the new task's time, even if running
    // This ensures task switches always show the correct time
    const activeTask = reduxTasks.find(t => t.id === activeTaskId);
    if (activeTask && activeTask.timeSpent !== undefined) {
      setElapsedSeconds(activeTask.timeSpent);
      if (secondsRef) {
        secondsRef.current = activeTask.timeSpent;
      }
    } else {
      // New task with no time
      setElapsedSeconds(0);
      if (secondsRef) {
        secondsRef.current = 0;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId, isRunning, reduxTasks, secondsRef, user?.id]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [task]);

  // Calculate underline width based on text content
  useEffect(() => {
    if (hiddenSpanRef.current) {
      // Measure the current text width (or placeholder if empty)
      const measuredWidth = hiddenSpanRef.current.offsetWidth;
      
      // Always use at least the placeholder width as minimum
      // The hidden span shows placeholder when task is empty, so first measurement is our minimum
      const minWidth = 340; // This should be the placeholder width
      
      if (textareaRef.current) {
        const inputWidth = textareaRef.current.offsetWidth;
        // Never go below placeholder width, never exceed input width
        const width = Math.min(Math.max(measuredWidth, minWidth), inputWidth);
        setUnderlineWidth(`${width}px`);
      } else {
        // Fallback to max of measured and min width
        const width = Math.max(measuredWidth, minWidth);
        setUnderlineWidth(`${width}px`);
      }
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
    // If timer is running, pause it first
    if (isRunning) {
      pauseTimer();
    }
    
    setIsEditingTime(true);
    const currentMinutes = Math.floor(remainingSeconds / 60);
    setEditingMinutes(currentMinutes.toString());
  };

  const handleTimeEditSubmit = () => {
    const minutes = parseInt(editingMinutes) || 0;

    // Limit to reasonable range (1 to 180 minutes)
    const validMinutes = Math.max(1, Math.min(180, minutes));
    
    // Get the current seconds (not the full minute)
    const currentSeconds = remainingSeconds % 60;
    
    // Set the new time with preserved seconds
    const newTotalSeconds = validMinutes * 60 + currentSeconds;

    setSelectedMinutes(validMinutes);
    setTotalSeconds(newTotalSeconds);
    setRemainingSeconds(newTotalSeconds);
    setIsEditingTime(false);
    // Reset the notification flag since we're setting a new time
    hasPlayedZeroNotificationRef.current = false;

    // Update Redux state optimistically
    dispatch(setPreference({ key: 'pomodoro_duration', value: validMinutes }));
    
    // Update database if user is logged in
    if (postgresUserId) {
      dispatch(updatePreferences({ 
        userId: postgresUserId, 
        updates: { pomodoro_duration: validMinutes } 
      }));
    }
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
    }
  }, [user?.id]);

  // Save timer state when user leaves the page (closes tab, refreshes, or navigates away)
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Save timer state if there are seconds accumulated (whether running or paused)
      if (elapsedSeconds > 0 && activeTaskId) {
        // Save as paused state with current elapsed seconds
        saveTimerState(false, elapsedSeconds);
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
    // Optimistically update UI immediately
    setIsRunning(false);
    setIsPaused(true);
    
    handleStop({
      task,
      seconds: elapsedSeconds,
      saveTimerState,
      setRunning: setIsRunning,
      setIsStarting,
      heartbeatIntervalRef,
    });
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
      setRemainingSeconds(totalSeconds);
      setElapsedSeconds(0);
      // Reset the notification flag for next pomodoro
      hasPlayedZeroNotificationRef.current = false;
    }
  }, [handleComplete, task, elapsedSeconds, localVolume, clearTimerState, onComplete, heartbeatIntervalRef, totalSeconds]);

  const handleClear = () => {
    // If there are elapsed seconds and onClearClick is provided, use it (triggers quit modal)
    if (elapsedSeconds > 0 && onClearClick) {
      onClearClick();
      return;
    }

    // Otherwise, just clear without quit modal
    // Clear heartbeat interval
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    setIsRunning(false);
    setIsPaused(false);
    dispatch(resetInput());
    dispatch(setActiveTask(null)); // Clear activeTaskId to prevent restoration
    setRemainingSeconds(totalSeconds);
    setElapsedSeconds(0);
    setShowTaskSuggestions(false);
    // Reset the notification flag
    hasPlayedZeroNotificationRef.current = false;
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
    <div className="flex flex-col items-center gap-4 px-4 sm:px-0 w-full max-w-4xl mx-auto -mt-10">
      {/* Hidden span to measure text width */}
      <span
        ref={hiddenSpanRef}
        className={`absolute opacity-0 pointer-events-none whitespace-nowrap ${
          task.length > 50 ? "text-xl md:text-2xl" : "text-2xl md:text-3xl"
        }`}
        style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif", fontWeight: 600 }}
      >
        {task || "What are you focusing on?"}
      </span>
      
      {/* Task input field - matching Timer styling */}
      <div className="relative group">
        <div className="flex flex-col items-center justify-center w-full px-4 sm:px-0">
          <textarea
          ref={textareaRef}
          value={task}
          onChange={(e) => {
            const newValue = e.target.value;
            if (newValue.length <= 100) {
              dispatch(setCurrentInput(newValue));
              // Clear activeTaskId if user clears the input
              if (!newValue.trim() && activeTaskId) {
                dispatch(setActiveTask(null));
              }
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && task.trim() && !isRunning && !isPaused) {
              e.preventDefault();
              startTimer();
              // Close Task List if it's open
              if (setShowTaskList) {
                setShowTaskList(false);
              }
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
          maxLength={100}
          className={`text-center font-semibold outline-none text-white mb-4 leading-tight mx-auto overflow-hidden resize-none transition-all duration-200 break-words ${
            inputLocked ? "cursor-not-allowed" : "bg-transparent"
          } ${
            task.length > 50 ? "text-xl md:text-2xl" : "text-2xl md:text-3xl"
          } ${
            task.length > 45 ? "max-w-[550px]" : ""
          } w-[95%] sm:w-[400px] lg:w-[650px]`}
          style={{ 
            fontFamily: "Inter, system-ui, -apple-system, sans-serif"
          }}
          rows={1}
        />
        {/* Custom underline */}
        <div
          className={`mx-auto transition-all duration-300 ${
            showNoTaskFeedback 
              ? "bg-[#FFAA00] animate-pulse" 
              : inputFocused && !inputLocked 
                ? "bg-[#FFAA00]" 
                : "bg-gray-700"
          }`}
          style={{
            width: underlineWidth,
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
            className="absolute mt-2 bg-[#0E1119]/95 backdrop-blur-sm border border-gray-700 rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{
              width: "600px",
              maxWidth: "90vw",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginTop: "8px",
            }}
          >
            <div
              className="task-dropdown-scrollbar rounded-xl"
              style={{
                maxHeight: "240px",
                overflowY: "auto",
                padding: "8px",
                paddingTop: "12px",
                paddingBottom: "12px",
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
                    // Don't set active task here - only when starting
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
          </div>
        )}
      </div>

      {/* Notes content - above timer */}
      {showNotes && notesContent && (
        <div className="mb-8 flex justify-center w-full max-h-52 overflow-y-auto">
          {notesContent}
        </div>
      )}
      
      {/* Main timer and buttons container - flex row when notes shown */}
      <div className={showNotes ? "flex items-center justify-center gap-8" : ""}>
        {/* Main Countdown Display - original size when no notes, smaller when notes shown */}
        <div className={`relative ${isCompact ? 'w-56 h-56 sm:w-72 sm:h-72' : 'w-72 h-72 sm:w-96 sm:h-96'}`}>
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
          {/* Main countdown - always editable - smaller text when compact */}
          <div
            className={`${isCompact ? 'text-5xl sm:text-6xl' : 'text-5xl sm:text-7xl'} font-bold text-white mb-2 ${
              !isEditingTime ? "cursor-text hover:text-[#FFAA00] transition-colors" : ""
            } ${isEditingTime ? "border-b-2 border-[#FFAA00]" : ""}`}
            onClick={handleTimeEdit}
            title="Click to edit time"
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

          {/* Time presets inside circle - show when not running or when timer is at 00:00 */}
          {(!isRunning && !isPaused) || (isPaused && remainingSeconds === 0) ? (
            <div className="flex flex-wrap justify-center gap-2 mt-6 px-4">
              {timePresets.map((preset) => (
                <button
                  key={preset.minutes}
                  onClick={() => {
                    setSelectedMinutes(preset.minutes);
                    // Set the new time immediately
                    const newSeconds = preset.minutes * 60;
                    setTotalSeconds(newSeconds);
                    setRemainingSeconds(newSeconds);
                    // Reset the notification flag since we're setting a new time
                    hasPlayedZeroNotificationRef.current = false;
                    
                    // Update Redux state optimistically
                    dispatch(setPreference({ key: 'pomodoro_duration', value: preset.minutes }));
                    
                    // Update database if user is logged in
                    if (postgresUserId) {
                      dispatch(updatePreferences({ 
                        userId: postgresUserId, 
                        updates: { pomodoro_duration: preset.minutes } 
                      }));
                    }
                  }}
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
          ) : null}

          {/* Subtle elapsed time counter - always show inside circle */}
          <div className={`text-sm text-gray-500 ${!isRunning && !isPaused ? "mt-4" : "mt-6"}`} style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}>
            Total time: {formatElapsedTime(elapsedSeconds)}
          </div>
        </div>
      </div>
      
      {/* Control buttons when notes shown - ALL buttons placed inside the flex container */}
      {showNotes && (
        <div className="flex flex-col gap-4">
          {/* Start button */}
          {!isRunning && !isPaused && (
            <button
              className={`bg-white text-black font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-105 w-full sm:w-48 cursor-pointer ${
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
          )}
          
          {/* Pause and Complete buttons when running */}
          {isRunning && (
            <>
              <button
                className="bg-white text-black font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-102 disabled:opacity-40 w-full sm:w-48 cursor-pointer"
                onClick={pauseTimer}
              >
                Pause
              </button>
              <button
                className={`${
                  showCompleteFeedback ? "bg-green-600" : "bg-green-500"
                } text-white font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-102 w-full sm:w-48 ${elapsedSeconds < 1 ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                onClick={completeTimer}
                disabled={isCompleting || elapsedSeconds < 1}
              >
                {showCompleteFeedback ? "Wait..." : "Complete"}
              </button>
            </>
          )}
          
          {/* Resume button when paused */}
          {isPaused && (
            <button
              className="bg-white text-black font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-105 disabled:opacity-40 w-full sm:w-48 cursor-pointer"
              onClick={resumeTimer}
              disabled={isStarting}
            >
              Resume
            </button>
          )}
          
          {/* Show/Hide Notes button - included in the same area */}
          {onNotesToggle && (
            <button
              className={`text-sm font-mono underline underline-offset-4 select-none transition-all px-2 py-1 bg-transparent border-none cursor-pointer ${
                showNotes ? "text-[#FFAA00] hover:text-[#FF9900]" : "text-gray-400 hover:text-[#FFAA00]"
              }`}
              onClick={onNotesToggle}
            >
              {showNotes ? "Hide Notes" : "Show Notes"}
            </button>
          )}
        </div>
      )}
      </div>

      {/* Control buttons when notes are NOT shown */}
      {!showNotes && (
        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center mt-4">
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

        {isRunning && !showNotes && (
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
                } text-white font-extrabold text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-xl shadow-lg transition hover:scale-102 w-full sm:w-48 ${elapsedSeconds < 1 ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                onClick={completeTimer}
                disabled={isCompleting || elapsedSeconds < 1}
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
      )}
      
      {/* Show/Hide Notes button - only show below when notes are NOT shown */}
      {onNotesToggle && !showNotes && (
        <div className="flex justify-center mt-4">
          <button
            className={`text-sm font-mono underline underline-offset-4 select-none transition-all px-2 py-1 bg-transparent border-none cursor-pointer ${
              showNotes ? "text-[#FFAA00] hover:text-[#FF9900]" : "text-gray-400 hover:text-[#FFAA00]"
            }`}
            onClick={onNotesToggle}
          >
            {showNotes ? "Hide Notes" : "Show Notes"}
          </button>
        </div>
      )}
    </div>
  );
}
