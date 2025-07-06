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
  onToggleComplete,
  onRemove,
  onEditTextChange,
  editInputRef,
}: {
  task: Task;
  isEditing: boolean;
  editingText: string;
  onStartEditing: (task: Task) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggleComplete: (id: string) => void;
  onRemove: (id: string) => void;
  onEditTextChange: (text: string) => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

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
      className={`group p-4 mx-2 my-1 rounded-xl border cursor-move ${
        isDragging
          ? "opacity-50 bg-gray-800 border-gray-600"
          : `transition-all duration-200 hover:shadow-lg hover:scale-[1.01] ${
              task.completed
                ? "bg-gray-800 border-gray-700 opacity-75"
                : "bg-gray-850 border-gray-700 hover:border-gray-600 hover:bg-gray-800"
            }`
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Drag Handle - Always visible */}
        <div
          className={`text-gray-500 transition-all duration-200 hover:text-[#FFAA00] ${
            isDragging ? "text-[#FFAA00]" : ""
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M8 6H8.01M8 12H8.01M8 18H8.01M16 6H16.01M16 12H16.01M16 18H16.01"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Checkbox */}
        <button
          onClick={() => onToggleComplete(task.id)}
          onPointerDown={(e) => e.stopPropagation()}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 hover:scale-110 ${
            task.completed
              ? "bg-[#FFAA00] border-[#FFAA00] shadow-lg shadow-[#FFAA00]/25"
              : "border-gray-500 hover:border-gray-400 hover:shadow-md"
          }`}
        >
          {task.completed && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="animate-in zoom-in duration-200">
              <path d="M5 12L9 16L19 6" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Task Text */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              ref={editInputRef}
              type="text"
              value={editingText}
              onChange={(e) => onEditTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onSaveEdit();
                } else if (e.key === "Escape") {
                  onCancelEdit();
                }
              }}
              onBlur={onSaveEdit}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full bg-gray-800 text-white px-3 py-1 rounded border border-[#FFAA00] focus:outline-none"
            />
          ) : (
            <p
              onClick={() => onStartEditing(task)}
              onPointerDown={(e) => e.stopPropagation()}
              className={`cursor-pointer hover:text-[#FFAA00] transition-colors truncate ${
                task.completed ? "text-gray-400 line-through" : "text-white"
              }`}
            >
              {task.text}
            </p>
          )}
        </div>

        {/* Delete Button */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onRemove(task.id)}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-gray-400 hover:text-red-400 p-1 rounded transition-colors"
            title="Delete task"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
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
      </div>
    </div>
  );
}

type FilterType = "all" | "incomplete" | "completed";

export default function TaskList({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useInstance();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [showClearMenu, setShowClearMenu] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

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
      editInputRef.current.select();
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
      const newTask: Omit<Task, "id"> = {
        text: newTaskText.trim(),
        completed: false,
        order: tasks.length,
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

  const toggleComplete = (id: string) => {
    if (user?.id) {
      const task = tasks.find((t) => t.id === id);
      if (task) {
        const taskRef = ref(rtdb, `users/${user.id}/tasks/${id}`);
        set(taskRef, { ...task, completed: !task.completed });
      }
    }
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

  const clearCompleted = () => {
    if (user?.id) {
      const completedTasks = tasks.filter((task) => task.completed);
      completedTasks.forEach((task) => {
        const taskRef = ref(rtdb, `users/${user.id}/tasks/${task.id}`);
        remove(taskRef);
      });
    }
    setShowClearMenu(false);
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

  const filteredTasks = tasks.filter((task) => {
    if (filter === "completed") return task.completed;
    if (filter === "incomplete") return !task.completed;
    return true; // "all"
  });

  const getFilterCounts = () => {
    const completed = tasks.filter((task) => task.completed).length;
    const incomplete = tasks.filter((task) => !task.completed).length;
    return { all: tasks.length, completed, incomplete };
  };

  const counts = getFilterCounts();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden border border-gray-800 animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-gray-800">
          <div className="flex items-center justify-between p-6 pb-4">
            <h2 className="text-xl font-semibold text-white">Task List</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">
                {tasks.length} task{tasks.length !== 1 ? "s" : ""}
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
                      onClick={clearCompleted}
                      disabled={counts.completed === 0}
                      className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-t-lg"
                    >
                      Clear Completed ({counts.completed})
                    </button>
                    <button
                      onClick={clearAll}
                      disabled={counts.all === 0}
                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-b-lg"
                    >
                      Clear All ({counts.all})
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

          {/* Filter Tabs */}
          <div className="flex px-6 pb-4">
            <div className="flex bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setFilter("all")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  filter === "all" ? "bg-[#FFAA00] text-black" : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
              >
                All ({counts.all})
              </button>
              <button
                onClick={() => setFilter("incomplete")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  filter === "incomplete"
                    ? "bg-[#FFAA00] text-black"
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
              >
                Incomplete ({counts.incomplete})
              </button>
              <button
                onClick={() => setFilter("completed")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  filter === "completed"
                    ? "bg-[#FFAA00] text-black"
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
              >
                Completed ({counts.completed})
              </button>
            </div>
          </div>
        </div>

        {/* Add Task Input */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addTask();
                }
              }}
              placeholder="Add a new task..."
              className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-[#FFAA00] focus:outline-none transition-colors"
            />
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
        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
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
              <p>
                {filter === "all"
                  ? "No tasks yet"
                  : filter === "completed"
                  ? "No completed tasks"
                  : "No incomplete tasks"}
              </p>
              <p className="text-sm mt-1">
                {filter === "all"
                  ? "Add your first task above"
                  : filter === "completed"
                  ? "Complete some tasks to see them here"
                  : "All tasks are completed!"}
              </p>
            </div>
          ) : (
            <div className="p-2">
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
                      onToggleComplete={toggleComplete}
                      onRemove={removeTask}
                      onEditTextChange={setEditingText}
                      editInputRef={editInputRef}
                    />
                  ))}
                </SortableContext>
                <DragOverlay>
                  {activeId ? (
                    <div className="p-4 mx-2 my-1 rounded-xl border bg-gray-850 border-[#FFAA00] shadow-2xl shadow-[#FFAA00]/40 scale-105 transform-gpu">
                      <div className="flex items-center gap-3">
                        <div className="text-[#FFAA00]">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M8 6H8.01M8 12H8.01M8 18H8.01M16 6H16.01M16 12H16.01M16 18H16.01"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                        <div className="w-5 h-5 rounded border-2 border-gray-500 flex items-center justify-center"></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white truncate">{tasks.find((task) => task.id === activeId)?.text}</p>
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
        <div className="fixed inset-0 z-60 bg-black bg-opacity-70 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 max-w-sm w-full animate-in slide-in-from-bottom-4 duration-300">
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
      )}
    </div>
  );
}
