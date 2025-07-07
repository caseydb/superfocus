"use client";
import React from "react";
import { useInstance } from "../Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off } from "firebase/database";

const maxLen = 69;

interface Task {
  id: string;
  text: string;
  completed: boolean;
  order?: number;
}

export default function TaskInput({
  task,
  setTask,
  disabled,
  onStart,
}: {
  task: string;
  setTask: (t: string) => void;
  disabled: boolean;
  onStart?: () => void;
}) {
  const { user } = useInstance();
  const chars = task.length;
  const [inputWidth, setInputWidth] = React.useState("95%");
  const spanRef = React.useRef<HTMLSpanElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = React.useState(false);
  const [showLimitPopup, setShowLimitPopup] = React.useState(false);
  const [availableTasks, setAvailableTasks] = React.useState<Task[]>([]);
  const [showTaskSuggestions, setShowTaskSuggestions] = React.useState(false);
  const [selectedTaskIndex, setSelectedTaskIndex] = React.useState(-1); // -1 means input is focused
  const suggestionsContainerRef = React.useRef<HTMLDivElement>(null);

  // Load tasks from Firebase (user-specific)
  React.useEffect(() => {
    if (!user?.id) return;

    const tasksRef = ref(rtdb, `users/${user.id}/tasks`);
    const handle = onValue(tasksRef, (snapshot) => {
      const tasksData = snapshot.val();
      if (tasksData) {
        // Convert Firebase object to array and sort by order
        const tasksArray = Object.entries(tasksData).map(([id, task]) => ({
          id,
          ...(task as Omit<Task, "id">),
        }));
        // Sort by order field, filter for incomplete tasks
        const incompleteTasks = tasksArray
          .filter((task) => !task.completed)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        setAvailableTasks(incompleteTasks);
      } else {
        setAvailableTasks([]);
      }
    });

    return () => {
      off(tasksRef, "value", handle);
    };
  }, [user?.id]);

  const updateInputWidth = React.useCallback(() => {
    if (spanRef.current && typeof window !== "undefined") {
      const screenWidth = window.innerWidth;
      if (screenWidth >= 640) {
        // Desktop: use calculated width
        const minWidth = 650;
        const maxWidth = 800;
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
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
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

  React.useEffect(() => {
    if (chars >= maxLen) {
      setShowLimitPopup(true);
    }
  }, [chars]);

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
        className="invisible absolute whitespace-pre text-3xl md:text-4xl font-semibold px-4"
        style={{ pointerEvents: "none" }}
      >
        {task || "What are you focusing on?"}
      </span>
      <textarea
        ref={textareaRef}
        value={task}
        onChange={(e) => {
          setTask(e.target.value.slice(0, maxLen));
          // Hide suggestions when user starts typing
          if (e.target.value.trim()) {
            setShowTaskSuggestions(false);
            setSelectedTaskIndex(-1);
          }
        }}
        maxLength={maxLen}
        className={`text-center text-3xl md:text-5xl font-semibold outline-none text-white mb-6 leading-tight mx-auto overflow-hidden resize-none transition-all duration-200 ${
          disabled ? "cursor-not-allowed" : "bg-transparent"
        }`}
        placeholder="What are you focusing on?"
        autoFocus
        rows={1}
        style={{ width: inputWidth }}
        onFocus={() => {
          setIsFocused(true);
          if (!task.trim() && availableTasks.length > 0) {
            setShowTaskSuggestions(true);
          }
        }}
        onClick={() => {
          // Show suggestions when clicking, even if already focused
          if (!task.trim() && availableTasks.length > 0) {
            setShowTaskSuggestions(true);
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
            // If a task is selected from suggestions, use that task
            if (showTaskSuggestions && selectedTaskIndex >= 0 && selectedTaskIndex < availableTasks.length) {
              setTask(availableTasks[selectedTaskIndex].text);
              setShowTaskSuggestions(false);
              setSelectedTaskIndex(-1);
            } else if (onStart) {
              onStart();
            }
          } else if (e.key === "ArrowDown" && showTaskSuggestions) {
            e.preventDefault();
            setSelectedTaskIndex((prev) => {
              const newIndex = prev < availableTasks.length - 1 ? prev + 1 : prev;
              // Scroll to keep selected item in view
              if (newIndex !== prev) {
                setTimeout(() => scrollToSelectedItem(newIndex), 0);
              }
              return newIndex;
            });
          } else if (e.key === "ArrowUp" && showTaskSuggestions) {
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
      {showTaskSuggestions && availableTasks.length > 0 && (
        <div
          ref={suggestionsContainerRef}
          className="absolute mt-2 p-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200 custom-scrollbar"
          style={{
            width: inputWidth,
            maxWidth: "90vw",
            top: "45%",
            left: "50%",
            transform: "translateX(-50%)",
            marginTop: "8px",
            maxHeight: "240px",
            overflowY: "auto",
          }}
        >
          <div className="text-xs text-gray-400 mb-2 px-2 font-mono">Choose from existing tasks:</div>
          <div className="space-y-1">
            {availableTasks.map((taskItem, index) => (
              <button
                key={taskItem.id}
                onClick={() => {
                  setTask(taskItem.text);
                  setShowTaskSuggestions(false);
                  setSelectedTaskIndex(-1);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-white text-sm truncate font-mono border ${
                  selectedTaskIndex === index
                    ? "bg-gray-800 border-[#FFAA00]/50"
                    : "border-transparent hover:bg-gray-800 hover:border-[#FFAA00]/30"
                }`}
              >
                {taskItem.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {showLimitPopup && (
        <div className="fixed top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-red-600 text-white text-3xl font-extrabold px-12 py-8 rounded-2xl shadow-2xl flex flex-col items-center gap-6 border-4 border-red-600">
          <span>Be compendious!</span>
          <button
            className="bg-white text-red-700 font-bold text-lg px-6 py-2 rounded shadow hover:bg-red-100 transition"
            onClick={() => setShowLimitPopup(false)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
