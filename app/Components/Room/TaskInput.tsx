"use client";
import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { setCurrentInput, setCurrentTask } from "../../store/taskInputSlice";
import { setActiveTask, updateTask, updateTaskName } from "../../store/taskSlice";
import { rtdb } from "../../../lib/firebase";
import { ref, remove, update } from "firebase/database";
import { useInstance } from "../Instances";

const maxLen = 100;

interface Task {
  id: string;
  text: string;
  completed: boolean;
  order?: number;
  timeSpent?: number;
}

export default function TaskInput({
  onStart,
  setShowTaskList,
}: {
  onStart?: () => void;
  setShowTaskList?: (show: boolean) => void;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useInstance();
  const { currentInput: task = "" } = useSelector((state: RootState) => state.taskInput);
  const [inputWidth, setInputWidth] = React.useState("95%");
  const [underlineWidth, setUnderlineWidth] = React.useState("615px"); // Default to approximate placeholder width
  const spanRef = React.useRef<HTMLSpanElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = React.useState(false);
  const [showLimitPopup, setShowLimitPopup] = React.useState(false);
  const [availableTasks, setAvailableTasks] = React.useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = React.useState<Task[]>([]);
  const [showTaskSuggestions, setShowTaskSuggestions] = React.useState(false);
  const [selectedTaskIndex, setSelectedTaskIndex] = React.useState(-1); // -1 means input is focused
  const suggestionsContainerRef = React.useRef<HTMLDivElement>(null);

  // Get tasks and preferences from Redux store
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const preferences = useSelector((state: RootState) => state.preferences);
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);
  const { hasStarted } = useSelector((state: RootState) => state.taskInput);
  
  // Track if we need to save on beforeunload
  const needsSaveRef = React.useRef(false);
  const lastSavedTaskNameRef = React.useRef("");
  
  // Helper function to clear the justCompletedTask flag
  const clearJustCompletedFlag = React.useCallback(async () => {
    if (user?.id) {
      const completedFlagRef = ref(rtdb, `TaskBuffer/${user.id}/justCompletedTask`);
      await remove(completedFlagRef).catch(() => {
        // Silent error - flag may not exist
      });
    }
  }, [user]);
  
  // Filter and sort available tasks from Redux
  React.useEffect(() => {
    // Filter for incomplete tasks and sort by order (same as TaskList)
    const incompleteTasks = reduxTasks
      .filter((task) => !task.completed)
      .sort((a, b) => a.order - b.order)
      .map((task) => ({
        id: task.id,
        text: task.name,
        completed: task.completed,
        order: task.order,
        timeSpent: task.timeSpent,
      }));
    
    setAvailableTasks(incompleteTasks);
    // Initialize filtered tasks with all available tasks
    setFilteredTasks(incompleteTasks);
  }, [reduxTasks]);

  // Filter tasks based on input text
  React.useEffect(() => {
    if (task.trim()) {
      // Filter tasks that contain the typed text (case-insensitive)
      const filtered = availableTasks.filter((taskItem) =>
        taskItem.text.toLowerCase().includes(task.toLowerCase().trim())
      );
      setFilteredTasks(filtered);
      // Keep selection on input field, not on dropdown items
      setSelectedTaskIndex(-1);
    } else {
      // Show all tasks when input is empty
      setFilteredTasks(availableTasks);
      setSelectedTaskIndex(-1);
    }
  }, [task, availableTasks]);


  const updateInputWidth = React.useCallback(() => {
    if (typeof window !== "undefined") {
      const screenWidth = window.innerWidth;
      if (screenWidth >= 1024) {
        // Desktop: fixed width for deep work mode
        setInputWidth("725px");
      } else if (screenWidth >= 640) {
        // Tablet: fixed width matching notes area
        setInputWidth("400px");
      } else {
        // Mobile: use wider responsive width to fit placeholder
        setInputWidth("95%");
      }
    }
  }, []);

  React.useEffect(() => {
    updateInputWidth();
  }, [task, updateInputWidth]);

  // Calculate underline width based on actual text width
  React.useEffect(() => {
    if (spanRef.current) {
      // Always measure the actual width
      const textWidth = spanRef.current.offsetWidth;
      const maxWidth = 725; // Maximum width (input field width)
      
      // Add padding to better match visual width
      const paddedWidth = !task.trim() ? textWidth + 109 : textWidth + 82;
      
      // Store the placeholder width as minimum (when task is empty)
      const minWidth = 615; // The placeholder width we set as default
      
      // Never go below placeholder width, never exceed max width
      const width = Math.min(Math.max(paddedWidth, minWidth), maxWidth);
      setUnderlineWidth(`${width}px`);
    }
  }, [task]);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const handleResize = () => updateInputWidth();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, [updateInputWidth]);

  // Helper to recalculate textarea height
  const recalculateHeight = React.useCallback(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      
      // Reset height to recalculate
      textarea.style.height = "auto";
      
      // Force complete reflow to ensure text size classes are applied
      textarea.style.display = 'none';
      void textarea.offsetHeight; // Force reflow
      textarea.style.display = '';
      
      // Use the actual scrollHeight
      textarea.style.height = textarea.scrollHeight + "px";
    }
  }, []);

  React.useEffect(() => {
    recalculateHeight();
  }, [task, inputWidth, recalculateHeight]);

  // Add resize listener to handle responsive text size changes
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const handleResize = () => {
        // Add a small delay to ensure CSS changes have been applied
        setTimeout(recalculateHeight, 50);
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, [recalculateHeight]);

  // Add beforeunload handler to save task name on page navigation
  React.useEffect(() => {
    const handleBeforeUnload = () => {
      // Only save if there are unsaved changes and task name has changed
      if (hasStarted && activeTaskId && task.trim() && needsSaveRef.current && task.trim() !== lastSavedTaskNameRef.current) {
        const token = localStorage.getItem("firebase_token");
        if (token) {
          // Use navigator.sendBeacon for reliable unload-time requests
          const data = JSON.stringify({
            taskId: activeTaskId,
            name: task.trim()
          });
          
          navigator.sendBeacon(
            "/api/task/name",
            new Blob([data], { type: "application/json" })
          );
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasStarted, activeTaskId, task, dispatch]);

  // Remove the useEffect that shows popup on load
  // We'll handle it directly in onChange instead

  // Function to scroll to selected item in suggestions
  const scrollToSelectedItem = React.useCallback((index: number) => {
    if (suggestionsContainerRef.current && index >= 0) {
      const container = suggestionsContainerRef.current;
      const items = container.querySelectorAll("button");
      const selectedItem = items[index];

      if (selectedItem) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = selectedItem.getBoundingClientRect();

        // Check if item is below visible area
        if (itemRect.bottom > containerRect.bottom) {
          selectedItem.scrollIntoView({ block: "end", behavior: "smooth" });
        }
        // Check if item is above visible area
        else if (itemRect.top < containerRect.top) {
          selectedItem.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      }
    }
  }, []);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full px-4 sm:px-0">
      <span
        ref={spanRef}
        className={`invisible absolute whitespace-pre font-semibold px-4 ${
          task.length > 50 ? "text-2xl md:text-4xl" : "text-3xl md:text-4xl"
        }`}
        style={{ pointerEvents: "none" }}
      >
        {task || "What are you focusing on?"}
      </span>
      <textarea
        ref={textareaRef}
        value={task}
        onChange={async (e) => {
          const newValue = e.target.value;
          const currentLength = task.length;
          const newLength = Math.min(newValue.length, maxLen);
          
          // Show popup when first reaching the limit (going from <100 to 100)
          if (currentLength < maxLen && newLength === maxLen) {
            setShowLimitPopup(true);
          }
          
          const finalValue = newValue.slice(0, maxLen);
          dispatch(setCurrentInput(finalValue));
          
          // If timer has started and there's an active task, update its name
          if (hasStarted && activeTaskId && finalValue.trim()) {
            // Update Redux
            dispatch(updateTask({ 
              id: activeTaskId, 
              updates: { name: finalValue.trim() }
            }));
            
            // Update Firebase TaskBuffer
            if (user?.id) {
              const taskRef = ref(rtdb, `TaskBuffer/${user.id}/${activeTaskId}`);
              await update(taskRef, { 
                name: finalValue.trim(),
                updated_at: Date.now()
              }).catch((error) => {
                console.error("Error updating task name in Firebase:", error);
              });
            }
            
            // Mark that we have unsaved changes
            needsSaveRef.current = true;
          }
          // Show suggestions when typing in dropdown mode
          if (preferences.task_selection_mode === "dropdown") {
            setShowTaskSuggestions(true);
          }
          
          // Force immediate height recalculation
          setTimeout(() => {
            recalculateHeight();
          }, 0);
        }}
        onPaste={() => {
          // Force height recalculation after paste
          requestAnimationFrame(() => {
            setTimeout(() => {
              recalculateHeight();
            }, 0);
          });
        }}
        maxLength={maxLen}
        className={`text-center font-semibold outline-none text-white mb-6 leading-tight mx-auto overflow-hidden resize-none transition-all duration-200 ${
          "bg-transparent"
        } ${
          task.length > 50 ? "text-2xl md:text-3xl" : "text-3xl md:text-5xl"
        }`}
        placeholder="What are you focusing on?"
        rows={1}
        style={{ width: inputWidth }}
        onFocus={() => {
          setIsFocused(true);
          // Show dropdown if in dropdown mode and there are tasks to show
          if (preferences.task_selection_mode === "dropdown" && filteredTasks.length > 0) {
            setShowTaskSuggestions(true);
          } else if (preferences.task_selection_mode === "sidebar" && setShowTaskList && !task.trim()) {
            setShowTaskList(true);
            // Keep focus on this input when opening sidebar
            setTimeout(() => {
              textareaRef.current?.focus();
            }, 50);
          }
        }}
        onClick={() => {
          // Show suggestions when clicking, even if already focused
          if (preferences.task_selection_mode === "dropdown" && filteredTasks.length > 0) {
            setShowTaskSuggestions(true);
          } else if (preferences.task_selection_mode === "sidebar" && setShowTaskList && !task.trim()) {
            setShowTaskList(true);
            // Keep focus on this input when opening sidebar
            setTimeout(() => {
              textareaRef.current?.focus();
            }, 50);
          }
        }}
        onBlur={async () => {
          setIsFocused(false);
          // Delay hiding suggestions to allow clicking on them
          setTimeout(() => {
            setShowTaskSuggestions(false);
            setSelectedTaskIndex(-1);
          }, 150);
          
          // Save task name to PostgreSQL if timer has started and name has changed
          if (hasStarted && activeTaskId && task.trim() && needsSaveRef.current) {
            const token = localStorage.getItem("firebase_token");
            if (token) {
              dispatch(updateTaskName({ 
                taskId: activeTaskId, 
                name: task.trim(), 
                token 
              }));
              lastSavedTaskNameRef.current = task.trim();
              needsSaveRef.current = false;
            }
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            // If a task is selected in dropdown, use it
            if (showTaskSuggestions && selectedTaskIndex >= 0 && filteredTasks[selectedTaskIndex]) {
              const selectedTask = filteredTasks[selectedTaskIndex];
              // Clear the justCompletedTask flag when selecting a new task
              clearJustCompletedFlag();
              // Set both the text and the task ID
              dispatch(setCurrentTask({ id: selectedTask.id, name: selectedTask.text }));
              dispatch(setActiveTask(selectedTask.id));
              setShowTaskSuggestions(false);
              setSelectedTaskIndex(-1);
            } else {
              // Otherwise start a new task
              if (onStart) {
                onStart();
              }
              setShowTaskSuggestions(false);
              setSelectedTaskIndex(-1);
              // Close Task List if it's open
              if (setShowTaskList) {
                setShowTaskList(false);
              }
            }
          } else if ((e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) && showTaskSuggestions) {
            e.preventDefault();
            setSelectedTaskIndex((prev) => {
              const newIndex = prev < filteredTasks.length - 1 ? prev + 1 : prev;
              // Scroll to keep selected item in view
              if (newIndex !== prev) {
                setTimeout(() => scrollToSelectedItem(newIndex), 0);
              }
              return newIndex;
            });
          } else if ((e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) && showTaskSuggestions) {
            e.preventDefault();
            setSelectedTaskIndex((prev) => {
              const newIndex = prev > -1 ? prev - 1 : -1;
              // Scroll to keep selected item in view
              if (newIndex !== prev && newIndex >= 0) {
                setTimeout(() => scrollToSelectedItem(newIndex), 0);
              }
              return newIndex;
            });
          } else if (e.key === "Escape" && showTaskSuggestions) {
            e.preventDefault();
            setShowTaskSuggestions(false);
            setSelectedTaskIndex(-1);
          }
        }}
      />
      {/* Custom underline with larger gap */}
      <div
        className={`mx-auto transition-all duration-300${isFocused ? "" : " bg-gray-700"}`}
        style={{
          width: underlineWidth,
          height: "2px",
          marginBottom: "50px",
          borderRadius: "2px",
          background: isFocused ? "#FFAA00" : undefined,
        }}
      />

      {/* Task Suggestions */}
      {showTaskSuggestions && filteredTasks.length > 0 && (
        <div
          className="absolute mt-2 bg-[#0E1119]/95 backdrop-blur-sm border border-gray-700 rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{
            width: inputWidth,
            maxWidth: "90vw",
            top: "45%",
            left: "50%",
            transform: "translateX(-50%)",
            marginTop: "8px",
          }}
        >
          <div
            ref={suggestionsContainerRef}
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
            {filteredTasks.map((taskItem, index) => (
              <button
                key={taskItem.id}
                onClick={() => {
                  // Clear the justCompletedTask flag when selecting a new task
                  clearJustCompletedFlag();
                  // Set both the text and the task ID
                  dispatch(setCurrentTask({ id: taskItem.id, name: taskItem.text }));
                  dispatch(setActiveTask(taskItem.id));
                  setShowTaskSuggestions(false);
                  setSelectedTaskIndex(-1);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-white text-sm font-mono border ${
                  selectedTaskIndex === index
                    ? "bg-gray-800 border-[#FFAA00]/50"
                    : "border-transparent hover:bg-gray-800 hover:border-[#FFAA00]/30"
                }`}
              >
                <span className="truncate">{taskItem.text}</span>
              </button>
            ))}
            </div>
          </div>
        </div>
      )}

      {showLimitPopup && (
        <div className="fixed inset-0 z-50 pointer-events-none animate-in fade-in duration-300">
          {/* Background overlay - dims background while keeping it visible */}
          <div className="absolute inset-0 bg-black/80 pointer-events-auto" />

          {/* Centered popup */}
          <div
            className="absolute inset-0 flex items-center justify-center p-4 pointer-events-auto"
            onClick={() => setShowLimitPopup(false)}
          >
            <div
              className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 max-w-sm w-full animate-in slide-in-from-bottom-4 duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center mb-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-yellow-400">
                      <path
                        d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-white text-center">Character Limit</h3>
                </div>
                <p className="text-gray-300 mb-6 text-center">
                  Be compendious! You&apos;ve reached the 100 character limit.
                </p>
                <button
                  onClick={() => setShowLimitPopup(false)}
                  className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
