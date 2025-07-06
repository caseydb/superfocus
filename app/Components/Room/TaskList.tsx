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

export default function TaskList({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { currentInstance } = useInstance();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
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

  // Load tasks from Firebase
  useEffect(() => {
    if (!currentInstance) return;

    const tasksRef = ref(rtdb, `instances/${currentInstance.id}/tasks`);
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
  }, [currentInstance]);

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

  const addTask = () => {
    if (newTaskText.trim() && currentInstance) {
      const id = Date.now().toString();
      const newTask: Omit<Task, "id"> = {
        text: newTaskText.trim(),
        completed: false,
        order: tasks.length,
      };
      const taskRef = ref(rtdb, `instances/${currentInstance.id}/tasks/${id}`);
      set(taskRef, newTask);
      setNewTaskText("");
    }
  };

  const removeTask = (id: string) => {
    if (currentInstance) {
      const taskRef = ref(rtdb, `instances/${currentInstance.id}/tasks/${id}`);
      remove(taskRef);
    }
  };

  const startEditing = (task: Task) => {
    setEditingId(task.id);
    setEditingText(task.text);
  };

  const saveEdit = () => {
    if (editingText.trim() && editingId && currentInstance) {
      const taskRef = ref(rtdb, `instances/${currentInstance.id}/tasks/${editingId}`);
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
    if (currentInstance) {
      const task = tasks.find((t) => t.id === id);
      if (task) {
        const taskRef = ref(rtdb, `instances/${currentInstance.id}/tasks/${id}`);
        set(taskRef, { ...task, completed: !task.completed });
      }
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id && currentInstance) {
      const oldIndex = tasks.findIndex((item) => item.id === active.id);
      const newIndex = tasks.findIndex((item) => item.id === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedTasks = arrayMove(tasks, oldIndex, newIndex);

        // Update order in Firebase for all tasks
        reorderedTasks.forEach((task, index) => {
          const taskRef = ref(rtdb, `instances/${currentInstance.id}/tasks/${task.id}`);
          set(taskRef, { ...task, order: index });
        });
      }
    }

    setActiveId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden border border-gray-800 animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-xl font-semibold text-white">Task List</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            </span>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
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
        <div className="max-h-96 overflow-y-auto">
          {tasks.length === 0 ? (
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
              <p>No tasks yet</p>
              <p className="text-sm mt-1">Add your first task above</p>
            </div>
          ) : (
            <div className="p-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                  {tasks.map((task) => (
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
    </div>
  );
}
