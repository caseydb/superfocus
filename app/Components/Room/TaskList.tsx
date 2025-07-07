"use client";
import React, { useState, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useInstance } from "../Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, set, onValue, off, remove } from "firebase/database";

interface Task {
  id: string;
  text: string;
  completed: boolean;
  order?: number;
}

function SortableTask({
  task,
  isEditing,
  editingText,
  onStartEditing,
  onSaveEdit,
  onCancelEdit,
  onRemove,
  onEditTextChange,
  editInputRef,
  onStartTask,
  currentTask,
  isTimerRunning,
  hasActiveTimer,
  onPauseTimer,
  timerSeconds,
}: {
  task: Task;
  isEditing: boolean;
  editingText: string;
  onStartEditing: (task: Task) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRemove: (id: string) => void;
  onEditTextChange: (text: string) => void;
  editInputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onStartTask?: (taskText: string) => void;
  currentTask?: string;
  isTimerRunning?: boolean;
  hasActiveTimer?: boolean;
  onPauseTimer?: () => void;
  timerSeconds?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const [isHovered, setIsHovered] = useState(false);

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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    zIndex: isDragging ? 999 : "auto",
    willChange: isDragging ? "transform" : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group p-2 mx-2 my-1 rounded-lg border cursor-move ${
        isDragging
          ? "opacity-50 bg-gray-800 border-gray-600"
          : (() => {
              const isCurrentTask = currentTask && currentTask.trim() === task.text.trim();
              if (isCurrentTask) {
                return "transition-all duration-200 hover:shadow-lg hover:scale-[1.01] bg-gray-850 border-[#FFAA00] shadow-md shadow-[#FFAA00]/20";
              }
              return "transition-all duration-200 hover:shadow-lg hover:scale-[1.01] bg-gray-850 border-gray-700 hover:border-gray-600 hover:bg-gray-800";
            })()
      }`}
    >
      <div className={`flex gap-2 ${isEditing ? "items-start" : "items-center"}`}>
        {/* Drag Handle - Always visible */}
        <div
          className={`text-gray-500 transition-all duration-200 hover:text-[#FFAA00] ${
            isDragging ? "text-[#FFAA00]" : ""
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M8 6H8.01M8 12H8.01M8 18H8.01M16 6H16.01M16 12H16.01M16 18H16.01"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Start/Pause Button */}
        {(() => {
          // Check if this task is the currently active task
          const isCurrentTask = currentTask && currentTask.trim() === task.text.trim();

          return isCurrentTask;
        })() ? (
          // Show pause/resume button for the current active task
          <button
            onClick={() => {
              if (isTimerRunning) {
                // Timer is running, pause it
                if (onPauseTimer) onPauseTimer();
              } else {
                // Timer is paused, resume it (which is the same as starting)
                if (onStartTask) onStartTask(task.text);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`p-1 rounded transition-colors flex items-center justify-center w-6 h-6 ${
              isTimerRunning ? "bg-[#FFAA00] text-black hover:bg-[#FF9900]" : "text-gray-400 hover:text-[#FFAA00]"
            }`}
            title={isTimerRunning ? "Pause timer" : "Resume timer"}
          >
            {isTimerRunning ? (
              // Pause icon
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M6 4H10V20H6V4ZM14 4H18V20H14V4Z" fill="currentColor" />
              </svg>
            ) : (
              // Resume/Play icon
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path
                  d="M8 5V19L19 12L8 5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="currentColor"
                />
              </svg>
            )}
          </button>
        ) : (
          // Show start button for other tasks
          <button
            onClick={() => {
              if (onStartTask) onStartTask(task.text);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={Boolean(hasActiveTimer && currentTask && currentTask.trim() !== task.text.trim())}
            className={`p-1 rounded transition-colors flex items-center justify-center w-6 h-6 ${
              hasActiveTimer && currentTask && currentTask.trim() !== task.text.trim()
                ? "text-gray-600 cursor-not-allowed"
                : "text-gray-400 hover:text-[#FFAA00]"
            }`}
            title={
              hasActiveTimer && currentTask && currentTask.trim() !== task.text.trim()
                ? "Another task is active"
                : "Start timer for this task"
            }
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path
                d="M8 5V19L19 12L8 5Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="currentColor"
              />
            </svg>
          </button>
        )}

        {/* Task Text */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="relative w-full">
              <textarea
                ref={editInputRef as React.RefObject<HTMLTextAreaElement>}
                value={editingText}
                onChange={(e) => {
                  if (e.target.value.length <= 69) {
                    onEditTextChange(e.target.value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSaveEdit();
                  } else if (e.key === "Escape") {
                    onCancelEdit();
                  }
                }}
                onBlur={onSaveEdit}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-full bg-gray-800 text-white px-4 py-1 pr-14 rounded border border-[#FFAA00] focus:outline-none text-sm resize-none leading-loose"
                maxLength={69}
                rows={1}
                style={{
                  height: "auto",
                  minHeight: "60px",
                  lineHeight: "1.6",
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  const scrollHeight = target.scrollHeight;

                  // If content requires more than single line height, use 60px minimum
                  // Otherwise use 40px minimum
                  const singleLineHeight = 40;
                  const multiLineMinHeight = 60;

                  if (scrollHeight > singleLineHeight) {
                    target.style.height = Math.max(scrollHeight, multiLineMinHeight) + "px";
                  } else {
                    target.style.height = Math.max(scrollHeight, singleLineHeight) + "px";
                  }
                }}
              />
              <div className="absolute right-4 top-1 text-xs text-gray-400">{editingText.length}/69</div>
            </div>
          ) : (
            <p
              onClick={() => onStartEditing(task)}
              onPointerDown={(e) => e.stopPropagation()}
              className={`cursor-pointer hover:text-[#FFAA00] transition-colors text-white text-sm ${
                isHovered ? "whitespace-normal break-words" : "truncate"
              }`}
              title={task.text.length > 40 && !isHovered ? task.text : undefined}
            >
              {task.text}
            </p>
          )}
        </div>

        {/* Action Buttons / Timer Display - Hidden when editing */}
        {!isEditing &&
          (() => {
            const isCurrentTask = currentTask && currentTask.trim() === task.text.trim();

            if (isCurrentTask) {
              return (
                <div className="flex items-center">
                  {/* Timer Display - visible by default, hidden on hover */}
                  <div className="text-[#FFAA00] text-xs font-mono font-medium group-hover:opacity-0 transition-opacity duration-200">
                    {formatTime(timerSeconds || 0)}
                  </div>
                  {/* Delete Button - hidden by default, visible on hover */}
                  <button
                    onClick={() => onRemove(task.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="text-gray-400 hover:text-red-400 p-1 rounded transition-colors opacity-0 group-hover:opacity-100 absolute"
                    title="Delete task"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M3 6H5H21M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6M19 6V20C19 20.5523 18.4477 21 18 21H6C5.44772 21 5 20.5523 5 20V6H19Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              );
            } else {
              return (
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Delete Button for non-active tasks */}
                  <button
                    onClick={() => onRemove(task.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="text-gray-400 hover:text-red-400 p-1 rounded transition-colors"
                    title="Delete task"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M3 6H5H21M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6M19 6V20C19 20.5523 18.4477 21 18 21H6C5.44772 21 5 20.5523 5 20V6H19Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              );
            }
          })()}
      </div>
    </div>
  );
}

export default function TaskList({
  isOpen,
  onClose,
  onStartTask,
  currentTask,
  isTimerRunning,
  hasActiveTimer,
  onPauseTimer,
  timerSeconds,
}: {
  isOpen: boolean;
  onClose: () => void;
  onStartTask?: (taskText: string) => void;
  currentTask?: string;
  isTimerRunning?: boolean;
  hasActiveTimer?: boolean;
  onPauseTimer?: () => void;
  timerSeconds?: number;
}) {
  const { user } = useInstance();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const [showClearMenu, setShowClearMenu] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load tasks from Firebase (user-specific)
  useEffect(() => {
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
        // Sort by order field, or fallback to creation order
        tasksArray.sort((a, b) => (a.order || 0) - (b.order || 0));

        setTasks(tasksArray);
      } else {
        setTasks([]);
      }
    });

    return () => {
      off(tasksRef, "value", handle);
    };
  }, [user?.id]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Focus edit input when editing
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      if (editInputRef.current instanceof HTMLInputElement) {
        editInputRef.current.select();
      } else if (editInputRef.current instanceof HTMLTextAreaElement) {
        editInputRef.current.select();
      }
    }
  }, [editingId]);

  // Close clear menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showClearMenu && !(event.target as Element).closest(".clear-menu")) {
        setShowClearMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showClearMenu]);

  const addTask = () => {
    if (newTaskText.trim() && user?.id) {
      const id = Date.now().toString();
      // Find the highest order number and add 1 to ensure it goes to the end
      const maxOrder = tasks.length > 0 ? Math.max(...tasks.map((task) => task.order || 0)) : -1;
      const newTask: Omit<Task, "id"> = {
        text: newTaskText.trim(),
        completed: false,
        order: maxOrder + 1,
      };
      const taskRef = ref(rtdb, `users/${user.id}/tasks/${id}`);
      set(taskRef, newTask);
      setNewTaskText("");
    }
  };

  const removeTask = (id: string) => {
    if (user?.id) {
      const taskRef = ref(rtdb, `users/${user.id}/tasks/${id}`);
      remove(taskRef);
    }
  };

  const startEditing = (task: Task) => {
    setEditingId(task.id);
    setEditingText(task.text);
  };

  const saveEdit = () => {
    if (editingText.trim() && editingId && user?.id) {
      const taskRef = ref(rtdb, `users/${user.id}/tasks/${editingId}`);
      const task = tasks.find((t) => t.id === editingId);
      if (task) {
        set(taskRef, { ...task, text: editingText.trim() });
      }
    }
    setEditingId(null);
    setEditingText("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id && user?.id) {
      const oldIndex = tasks.findIndex((item) => item.id === active.id);
      const newIndex = tasks.findIndex((item) => item.id === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedTasks = arrayMove(tasks, oldIndex, newIndex);

        // Update order in Firebase for all tasks
        reorderedTasks.forEach((task, index) => {
          const taskRef = ref(rtdb, `users/${user.id}/tasks/${task.id}`);
          set(taskRef, { ...task, order: index });
        });
      }
    }

    setActiveId(null);
  };

  const clearAll = () => {
    setShowClearMenu(false);
    setShowClearAllConfirm(true);
  };

  const confirmClearAll = () => {
    if (user?.id) {
      const tasksRef = ref(rtdb, `users/${user.id}/tasks`);
      set(tasksRef, null);
    }
    setShowClearAllConfirm(false);
  };

  // Only show incomplete tasks
  const filteredTasks = tasks.filter((task) => !task.completed);

  const incompleteTasks = tasks.filter((task) => !task.completed).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none animate-in fade-in duration-300">
      {/* Click-outside-to-close backdrop */}
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />

      <div
        className="absolute bottom-4 right-4 w-[480px] max-w-[calc(100vw-2rem)] sm:max-w-[480px] max-h-[calc(100vh-8rem)] bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-gray-800">
          <div className="flex items-center justify-between p-6 pb-4">
            <h2 className="text-xl font-semibold text-white">Task List</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">
                {incompleteTasks} task{incompleteTasks !== 1 ? "s" : ""}
              </span>
              {/* Clear Menu */}
              <div className="relative clear-menu">
                <button
                  onClick={() => setShowClearMenu(!showClearMenu)}
                  className="text-gray-400 hover:text-white transition-colors p-1"
                  title="Clear options"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 12H12.01M12 6H12.01M12 18H12.01"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                {showClearMenu && (
                  <div className="absolute right-0 top-8 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 min-w-[180px]">
                    <button
                      onClick={clearAll}
                      disabled={incompleteTasks === 0}
                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                    >
                      Clear All ({incompleteTasks})
                    </button>
                  </div>
                )}
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Add Task Input */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={newTaskText}
                onChange={(e) => {
                  if (e.target.value.length <= 69) {
                    setNewTaskText(e.target.value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addTask();
                  }
                }}
                placeholder="Add a new task..."
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-[#FFAA00] focus:outline-none transition-colors"
                maxLength={69}
              />
              {newTaskText.length > 0 && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-400">
                  {newTaskText.length}/69
                </div>
              )}
            </div>
            <button
              onClick={addTask}
              disabled={!newTaskText.trim()}
              className="bg-[#FFAA00] text-black px-6 py-3 rounded-xl font-medium hover:bg-[#FF9900] hover:shadow-lg hover:shadow-[#FFAA00]/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105"
            >
              Add
            </button>
          </div>
        </div>

        {/* Task List */}
        <div className="max-h-[40vh] overflow-y-auto custom-scrollbar">
          {filteredTasks.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mx-auto mb-3 opacity-50">
                <path
                  d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p>No tasks to do</p>
              <p className="text-sm mt-1">Add your first task above</p>
            </div>
          ) : (
            <div className="p-1">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={filteredTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                  {filteredTasks.map((task) => (
                    <SortableTask
                      key={task.id}
                      task={task}
                      isEditing={editingId === task.id}
                      editingText={editingText}
                      onStartEditing={startEditing}
                      onSaveEdit={saveEdit}
                      onCancelEdit={cancelEdit}
                      onRemove={removeTask}
                      onEditTextChange={setEditingText}
                      editInputRef={editInputRef}
                      onStartTask={onStartTask}
                      currentTask={currentTask}
                      isTimerRunning={isTimerRunning}
                      hasActiveTimer={hasActiveTimer}
                      onPauseTimer={onPauseTimer}
                      timerSeconds={timerSeconds}
                    />
                  ))}
                </SortableContext>
                <DragOverlay>
                  {activeId ? (
                    <div className="p-2 mx-2 my-1 rounded-lg border bg-gray-850 border-[#FFAA00] shadow-2xl shadow-[#FFAA00]/40 scale-105 transform-gpu">
                      <div className="flex items-center gap-2">
                        <div className="text-[#FFAA00]">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M8 6H8.01M8 12H8.01M8 18H8.01M16 6H16.01M16 12H16.01M16 18H16.01"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                        <div className="w-6 h-6 rounded border-2 border-gray-500 flex items-center justify-center"></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white truncate text-sm">
                            {tasks.find((task) => task.id === activeId)?.text}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          )}
        </div>
      </div>

      {/* Clear All Confirmation Dialog */}
      {showClearAllConfirm && (
        <div className="fixed inset-0 z-60 pointer-events-none animate-in fade-in duration-300">
          {/* Background overlay at 80% opacity */}
          <div className="absolute inset-0 bg-black bg-opacity-20 pointer-events-auto" />

          {/* Centered popup */}
          <div
            className="absolute inset-0 flex items-center justify-center p-4 pointer-events-auto"
            onClick={() => setShowClearAllConfirm(false)}
          >
            <div
              className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 max-w-sm w-full animate-in slide-in-from-bottom-4 duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-red-400">
                      <path
                        d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-white">Clear All Tasks</h3>
                </div>
                <p className="text-gray-300 mb-6">
                  Are you sure you want to delete all {tasks.length} tasks? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowClearAllConfirm(false)}
                    className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmClearAll}
                    className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
