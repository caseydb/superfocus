"use client";
import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../store/store";
import { setCurrentInput, setCurrentTask } from "../../store/taskInputSlice";
import { setActiveTask } from "../../store/taskSlice";

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
  const dispatch = useDispatch();
  const { currentInput: task, isLocked: disabled } = useSelector((state: RootState) => state.taskInput);
  const [inputWidth, setInputWidth] = React.useState("95%");
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
    if (spanRef.current && typeof window !== "undefined") {
      const screenWidth = window.innerWidth;
      if (screenWidth >= 768) {
        // Desktop: use calculated width
        const minWidth = 650;
        const maxWidth = 800;
        const width = Math.min(Math.max(spanRef.current.offsetWidth + 40, minWidth), maxWidth);
        setInputWidth(`${width}px`);
      } else if (screenWidth >= 640) {
        // Tablet: use smaller min width
        const minWidth = 400;
        const maxWidth = 600;
        const width = Math.min(Math.max(spanRef.current.offsetWidth + 40, minWidth), maxWidth);
        setInputWidth(`${width}px`);
      } else {
        // Mobile: use wider responsive width to fit placeholder
        setInputWidth("95%");
      }
    }
  }, []);

  React.useEffect(() => {
    updateInputWidth();
  }, [task, updateInputWidth]);

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
        onChange={(e) => {
          const newValue = e.target.value;
          const currentLength = task.length;
          const newLength = Math.min(newValue.length, maxLen);
          
          // Show popup when first reaching the limit (going from <100 to 100)
          if (currentLength < maxLen && newLength === maxLen) {
            setShowLimitPopup(true);
          }
          
          dispatch(setCurrentInput(newValue.slice(0, maxLen)));
          // Show suggestions when typing in dropdown mode (but not when disabled)
          if (preferences.task_selection_mode === "dropdown" && !disabled) {
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
          disabled ? "cursor-not-allowed" : "bg-transparent"
        } ${
          task.length > 50 ? "text-2xl md:text-4xl" : "text-3xl md:text-5xl"
        }`}
        placeholder="What are you focusing on?"
        rows={1}
        style={{ width: inputWidth }}
        onFocus={() => {
          setIsFocused(true);
          // Show dropdown if in dropdown mode and there are tasks to show (but not when disabled)
          if (preferences.task_selection_mode === "dropdown" && filteredTasks.length > 0 && !disabled) {
            setShowTaskSuggestions(true);
          } else if (preferences.task_selection_mode === "sidebar" && setShowTaskList && !task.trim() && !disabled) {
            setShowTaskList(true);
            // Keep focus on this input when opening sidebar
            setTimeout(() => {
              textareaRef.current?.focus();
            }, 50);
          }
        }}
        onClick={() => {
          // Show suggestions when clicking, even if already focused (but not when disabled)
          if (preferences.task_selection_mode === "dropdown" && filteredTasks.length > 0 && !disabled) {
            setShowTaskSuggestions(true);
          } else if (preferences.task_selection_mode === "sidebar" && setShowTaskList && !task.trim() && !disabled) {
            setShowTaskList(true);
            // Keep focus on this input when opening sidebar
            setTimeout(() => {
              textareaRef.current?.focus();
            }, 50);
          }
        }}
        onBlur={() => {
          setIsFocused(false);
          // Delay hiding suggestions to allow clicking on them
          setTimeout(() => {
            setShowTaskSuggestions(false);
            setSelectedTaskIndex(-1);
          }, 150);
        }}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !disabled) {
            e.preventDefault();
            // If a task is selected in dropdown, use it
            if (showTaskSuggestions && selectedTaskIndex >= 0 && filteredTasks[selectedTaskIndex]) {
              const selectedTask = filteredTasks[selectedTaskIndex];
              // Set both the text and the task ID
              console.log('[TaskInput] Setting active task from keyboard selection:', selectedTask.id, selectedTask.text);
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
        className={`mx-auto transition-colors duration-200${isFocused && !disabled ? "" : " bg-gray-700"}`}
        style={{
          width: inputWidth,
          height: "2px",
          marginBottom: "50px",
          borderRadius: "2px",
          background: isFocused && !disabled ? "#FFAA00" : undefined,
        }}
      />

      {/* Task Suggestions */}
      {showTaskSuggestions && filteredTasks.length > 0 && !disabled && (
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
                  // Set both the text and the task ID
                  console.log('[TaskInput] Setting active task from click:', taskItem.id, taskItem.text);
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
