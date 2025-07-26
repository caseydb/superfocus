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
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import {
  addTask,
  deleteTask,
  updateTask,
  reorderTasks,
  createTaskThunk,
  deleteTaskThunk,
  updateTaskOrder,
} from "../../store/taskSlice";
import { 
  setNotes, 
  updateNote, 
  addNote, 
  removeNote, 
  reorderNotes, 
  toggleCheckbox as toggleCheckboxAction,
  selectNotesByTaskId,
  selectIsSavingByTaskId,
  selectHasNotesForTaskId
} from "../../store/notesSlice";
import { fetchNotes, saveNotes as saveNotesThunk } from "../../store/notesThunks";
import { v4 as uuidv4 } from "uuid";
// TODO: Remove firebase imports when replacing with proper persistence
// import { rtdb } from "../../../lib/firebase";
// import { ref, set, onValue, off, remove } from "firebase/database";

interface Task {
  id: string;
  text: string;
  completed: boolean;
  order?: number;
  timeSpent?: number;
}

interface NoteItem {
  id: string;
  type: "text" | "checkbox" | "bullet" | "number";
  content: string;
  completed?: boolean;
  level: number;
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
  isExpanded,
  onToggleExpanded,
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
  isExpanded?: boolean;
  onToggleExpanded?: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user } = useInstance();
  const dispatch = useDispatch<AppDispatch>();
  const notes = useSelector((state: RootState) => selectNotesByTaskId(task.id)(state));
  const isSavingNotes = useSelector((state: RootState) => selectIsSavingByTaskId(task.id)(state));
  const hasNotesInStore = useSelector((state: RootState) => selectHasNotesForTaskId(task.id)(state));
  const [isHovered, setIsHovered] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<number>(2);
  const inputRefs = useRef<{ [key: string]: HTMLTextAreaElement }>({});

  // Load notes when task is expanded for the first time
  useEffect(() => {
    if (!task.id || !isExpanded || hasNotesInStore) return;
    
    // Fetch notes from database
    dispatch(fetchNotes(task.id));
  }, [task.id, isExpanded, hasNotesInStore, dispatch]);

  // Initialize empty notes after fetch if none exist
  useEffect(() => {
    if (task.id && notes.length === 0 && hasNotesInStore && isExpanded) {
      // Only initialize if we've checked the database and found no notes
      dispatch(setNotes({ taskId: task.id, notes: [{ id: "1", type: "text", content: "", level: 0 }] }));
    }
  }, [task.id, notes.length, hasNotesInStore, isExpanded, dispatch]);

  // Update nextId when notes change
  useEffect(() => {
    if (notes.length > 0) {
      const maxId = Math.max(...notes.map((item) => parseInt(item.id)), 0);
      setNextId(maxId + 1);
    }
  }, [notes]);

  // Save notes to database
  const saveNotesToDB = () => {
    if (!task.id) return;
    dispatch(saveNotesThunk({ taskId: task.id, notes }));
  };

  // Auto-resize textarea
  const autoResize = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(28, textarea.scrollHeight)}px`;
  };

  // Handle textarea height adjustment when editing text changes
  useEffect(() => {
    if (isEditing && editInputRef.current instanceof HTMLTextAreaElement) {
      const textarea = editInputRef.current;
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;

      const singleLineHeight = 40;
      const multiLineMinHeight = 60;

      if (scrollHeight > singleLineHeight) {
        textarea.style.height = Math.max(scrollHeight, multiLineMinHeight) + "px";
      } else {
        textarea.style.height = Math.max(scrollHeight, singleLineHeight) + "px";
      }
    }
  }, [isEditing, editingText, editInputRef]);

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

  // Handle content changes in notes
  const handleContentChange = (id: string, value: string) => {
    if (!task.id) return;
    dispatch(updateNote({ taskId: task.id, noteId: id, updates: { content: value } }));

    // Auto-resize
    const textarea = inputRefs.current[id];
    if (textarea) {
      autoResize(textarea);
    }
  };

  // Toggle checkbox
  const toggleCheckbox = (id: string) => {
    if (!task.id) return;
    dispatch(toggleCheckboxAction({ taskId: task.id, noteId: id }));
  };

  // Get numbered list number
  const getNumberedIndex = (currentIndex: number): number => {
    let count = 1;
    for (let i = 0; i < currentIndex; i++) {
      if (notes[i].type === "number" && notes[i].level === notes[currentIndex].level) {
        count++;
      }
    }
    return count;
  };

  // Handle key down events in notes
  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    // Always stop space and enter from propagating to parent
    if (e.key === " " || e.key === "Enter") {
      e.stopPropagation();
    }

    const currentIndex = notes.findIndex((item) => item.id === id);
    const currentItem = notes[currentIndex];

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      // Create new item
      const newId = nextId.toString();
      setNextId(nextId + 1);
      let newType: NoteItem["type"] = "text";
      const newLevel = currentItem.level;
      // If current line is formatted and has text, continue the format
      // If current line is empty (0 length), always create normal text
      if (["checkbox", "bullet", "number"].includes(currentItem.type) && currentItem.content.length > 0) {
        newType = currentItem.type;
      }
      // If current item is empty and formatted, convert it to text first
      if (["checkbox", "bullet", "number"].includes(currentItem.type) && currentItem.content.length === 0) {
        if (!task.id) return;
        dispatch(updateNote({ taskId: task.id, noteId: id, updates: { type: "text", completed: false } }));
        return;
      }
      const newItem: NoteItem = {
        id: newId,
        type: newType,
        content: "",
        level: newLevel,
      };

      if (!task.id) return;
      dispatch(addNote({ taskId: task.id, note: newItem }));

      // Focus new item after render
      setTimeout(() => {
        const newTextarea = inputRefs.current[newId];
        if (newTextarea) {
          newTextarea.focus();
        }
      }, 0);
    }

    if (e.key === "Backspace" && currentItem.content === "" && notes.length > 1) {
      e.preventDefault();
      if (!task.id) return;
      dispatch(removeNote({ taskId: task.id, noteId: id }));

      if (currentIndex > 0) {
        const prevId = notes[currentIndex - 1].id;

        setTimeout(() => {
          const prevTextarea = inputRefs.current[prevId];
          if (prevTextarea) {
            prevTextarea.focus();
            prevTextarea.setSelectionRange(prevTextarea.value.length, prevTextarea.value.length);
          }
        }, 0);
      }
    }

    if (e.key === "Backspace" && currentItem.content === "" && notes.length === 1 && currentItem.type !== "text") {
      e.preventDefault();
      if (!task.id) return;
      dispatch(updateNote({ taskId: task.id, noteId: currentItem.id, updates: { type: "text", completed: false } }));
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const newLevel = e.shiftKey ? Math.max(0, currentItem.level - 1) : Math.min(3, currentItem.level + 1);
      if (!task.id) return;
      dispatch(updateNote({ taskId: task.id, noteId: id, updates: { level: newLevel } }));
    }

    if (e.key === "ArrowUp" && currentIndex > 0) {
      e.preventDefault();
      const prevId = notes[currentIndex - 1].id;
      inputRefs.current[prevId]?.focus();
    }

    if (e.key === "ArrowDown" && currentIndex < notes.length - 1) {
      e.preventDefault();
      const nextId = notes[currentIndex + 1].id;
      inputRefs.current[nextId]?.focus();
    }
  };

  // Handle input for auto-formatting
  const handleInput = (id: string, value: string) => {
    const item = notes.find((item) => item.id === id);
    if (!item || !task.id) return;

    let newType = item.type;
    let newContent = value;

    // Only process formatting at the beginning of the line
    if (item.type === "text" && value.length <= 4) {
      if (value === "[]" || value === "[] ") {
        newType = "checkbox";
        newContent = value.replace(/^\[\]\s*/, "");
      } else if (value === "[x] " || value === "[X] ") {
        newType = "checkbox";
        newContent = "";
        dispatch(updateNote({ 
          taskId: task.id, 
          noteId: id, 
          updates: { type: newType, content: newContent, completed: true } 
        }));
        return;
      } else if (value === "- ") {
        newType = "bullet";
        newContent = "";
      } else if (/^(\d+)\.\s$/.test(value)) {
        newType = "number";
        newContent = "";
      }
    }

    if (newType !== item.type || newContent !== value) {
      dispatch(updateNote({ 
        taskId: task.id, 
        noteId: id, 
        updates: { type: newType, content: newContent } 
      }));
    }
  };

  // Drag handlers for notes
  const handleNoteDragStart = (e: React.DragEvent, id: string) => {
    const item = notes.find((item) => item.id === id);
    if (item?.type !== "checkbox") {
      e.preventDefault();
      return;
    }
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleNoteDragOver = (e: React.DragEvent, id: string) => {
    const item = notes.find((item) => item.id === id);
    if (item?.type !== "checkbox") {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  };

  const handleNoteDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverId(null);
  };

  const handleNoteDrop = (e: React.DragEvent, targetId: string) => {
    const targetItem = notes.find((item) => item.id === targetId);
    if (targetItem?.type !== "checkbox") {
      return;
    }

    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");

    if (draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const draggedIndex = notes.findIndex((item) => item.id === draggedId);
    const targetIndex = notes.findIndex((item) => item.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const newItems = [...notes];
    const [draggedItem] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, draggedItem);

    if (!task.id) return;
    dispatch(reorderNotes({ taskId: task.id, notes: newItems }));
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleNoteDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    zIndex: isDragging ? 999 : "auto",
    willChange: isDragging ? "transform" : "auto",
  };

  const isCurrentTask = currentTask && currentTask.trim() === task.text.trim();

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-task-id={task.id}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group p-2 mx-2 my-1 rounded-lg border ${
        isDragging
          ? "opacity-50 bg-gray-800 border-gray-600"
          : isCurrentTask
          ? "transition-all duration-200 hover:shadow-lg hover:scale-[1.01] bg-gray-850 border-[#FFAA00] shadow-md shadow-[#FFAA00]/20"
          : "transition-all duration-200 hover:shadow-lg hover:scale-[1.01] bg-gray-850 border-gray-700 hover:border-gray-600 hover:bg-gray-800"
      }`}
    >
      <div className={`${isExpanded ? "space-y-3" : ""}`}>
        <div className={`flex gap-2 ${isEditing ? "items-start" : "items-center"}`}>
          {/* Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            className={`text-gray-500 transition-all duration-200 hover:text-[#FFAA00] cursor-move ${
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
              disabled={Boolean(hasActiveTimer && (!currentTask || currentTask.trim() !== task.text.trim()))}
              className={`p-1 rounded transition-colors flex items-center justify-center w-6 h-6 ${
                hasActiveTimer && (!currentTask || currentTask.trim() !== task.text.trim())
                  ? "text-gray-600 cursor-not-allowed"
                  : "text-gray-400 hover:text-[#FFAA00]"
              }`}
              title={
                hasActiveTimer && (!currentTask || currentTask.trim() !== task.text.trim())
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
                <input
                  ref={editInputRef as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={editingText}
                  onChange={(e) => {
                    if (e.target.value.length <= 69) {
                      onEditTextChange(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onSaveEdit();
                    } else if (e.key === "Escape") {
                      onCancelEdit();
                    } else if (e.key === " ") {
                      // Prevent space bar from causing any focus issues
                      e.stopPropagation();
                    }
                  }}
                  onBlur={(e) => {
                    // Use a small delay to check if focus is really lost
                    setTimeout(() => {
                      // Only save if the textarea is no longer the active element
                      if (document.activeElement !== e.target) {
                        onSaveEdit();
                      }
                    }, 100);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-full bg-gray-800 text-white px-2 py-1 pr-14 rounded border border-[#FFAA00] focus:outline-none text-sm"
                  maxLength={69}
                  autoFocus
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  {editingText.length}/69
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <p
                  onClick={() => {
                    const isCurrentTask = currentTask && currentTask.trim() === task.text.trim();
                    if (!isCurrentTask) {
                      // For non-active tasks: edit and expand
                      onStartEditing(task);
                      if (!isExpanded && onToggleExpanded) {
                        onToggleExpanded(task.id);
                      }
                    } else {
                      // For active tasks: only expand (no edit)
                      if (!isExpanded && onToggleExpanded) {
                        onToggleExpanded(task.id);
                      }
                    }
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`flex-1 ${(() => {
                    const isCurrentTask = currentTask && currentTask.trim() === task.text.trim();
                    if (isCurrentTask) {
                      return "cursor-pointer text-gray-400 text-sm hover:text-gray-300";
                    } else {
                      return `cursor-pointer hover:text-[#FFAA00] transition-colors text-white text-sm ${
                        isHovered ? "whitespace-normal break-words" : "truncate"
                      }`;
                    }
                  })()}`}
                  title={(() => {
                    const isCurrentTask = currentTask && currentTask.trim() === task.text.trim();
                    if (isCurrentTask) {
                      return "Click to expand and view notes";
                    } else {
                      return "Click to edit and expand";
                    }
                  })()}
                >
                  {task.text}
                </p>
                {/* Expand/Collapse button */}
                <button
                  onClick={() => {
                    if (onToggleExpanded) {
                      onToggleExpanded(task.id);
                    }
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`p-1 rounded transition-all duration-200 flex items-center justify-center w-5 h-5 ${
                    isExpanded
                      ? "text-[#FFAA00] hover:text-[#FF9900] bg-[#FFAA00]/10"
                      : "text-gray-500 hover:text-[#FFAA00] hover:bg-gray-800"
                  }`}
                  title={isExpanded ? "Collapse notes" : "Expand to add notes"}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path
                      d={isExpanded ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6"}
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Collapse/Remove Button */}
          {isExpanded ? (
            // Collapse button when expanded
            <button
              onClick={() => {
                if (onToggleExpanded) {
                  onToggleExpanded(task.id);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 rounded transition-colors flex items-center justify-center w-6 h-6 text-gray-400 hover:text-white"
              title="Collapse"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6L18 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : (
            // Timer display and remove button when collapsed
            !isEditing &&
            (() => {
              if (isCurrentTask) {
                return (
                  <div className="flex items-center">
                    {/* Timer Display - visible by default, hidden on hover */}
                    <div className="text-[#FFAA00] text-xs font-mono font-medium group-hover:opacity-0 transition-opacity duration-200">
                      {formatTime(timerSeconds || 0)}
                    </div>
                    {/* Delete Button - disabled for active tasks */}
                    <button
                      onClick={() => onRemove(task.id)}
                      onPointerDown={(e) => e.stopPropagation()}
                      disabled={true}
                      className="text-gray-600 cursor-not-allowed p-1 rounded opacity-0 group-hover:opacity-100 absolute"
                      title="Cannot delete active task"
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
                // Non-active tasks
                const taskTime = task.timeSpent || 0;
                
                return (
                  <div className="flex items-center">
                    {/* Time Display for non-active tasks with time */}
                    {taskTime > 0 && (
                      <div className="text-gray-500 text-xs font-mono font-medium mr-2 group-hover:opacity-0 transition-opacity duration-200">
                        {formatTime(taskTime)}
                      </div>
                    )}
                    {/* Delete Button for non-active tasks */}
                    <div className={`flex items-center ${taskTime > 0 ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
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
                  </div>
                );
              }
            })()
          )}
        </div>

        {/* Notes Section - Only visible when expanded */}
        {isExpanded && (
          <div className="animate-in slide-in-from-top-2 duration-200">
            <div className="bg-[#0A0E1A] rounded-xl border border-gray-800/50 overflow-hidden">
              {/* Notes Header with Save Button */}
              <div className="px-6 py-3 bg-gray-800/30 border-b border-gray-800/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-400">
                    Notes for this task
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="px-2 py-1 bg-gray-700/50 rounded text-gray-500 text-xs">⌘J</span>
                    <span className="text-xs text-gray-500">Toggle Notes</span>
                  </div>
                </div>
                <button
                  onClick={saveNotesToDB}
                  disabled={isSavingNotes}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    isSavingNotes
                      ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                      : "bg-[#FFAA00] hover:bg-[#FF9900] text-black"
                  }`}
                >
                  {isSavingNotes ? "Saving..." : "Save Notes"}
                </button>
              </div>
              
              {/* Notes Content */}
              <div className="p-6 max-h-[40vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-2">
                  {notes.map((item, index) => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 group transition-all duration-200 ${
                        draggedId === item.id ? "opacity-50 scale-95" : ""
                      } ${dragOverId === item.id ? "bg-gray-700/30 rounded-lg" : ""}`}
                      style={{ paddingLeft: `${item.level * 24}px` }}
                      draggable={item.type === "checkbox"}
                      onDragStart={(e) => handleNoteDragStart(e, item.id)}
                      onDragOver={(e) => handleNoteDragOver(e, item.id)}
                      onDragLeave={handleNoteDragLeave}
                      onDrop={(e) => handleNoteDrop(e, item.id)}
                      onDragEnd={handleNoteDragEnd}
                    >
                      {/* Drag Handle - Only for checklist items */}
                      {item.type === "checkbox" && (
                        <div className="flex items-center justify-center w-6 h-7 flex-shrink-0 cursor-grab active:cursor-grabbing">
                          <div className="w-4 h-4 text-gray-500 hover:text-gray-300 transition-colors">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="8" cy="6" r="1.5" />
                              <circle cx="16" cy="6" r="1.5" />
                              <circle cx="8" cy="12" r="1.5" />
                              <circle cx="16" cy="12" r="1.5" />
                              <circle cx="8" cy="18" r="1.5" />
                              <circle cx="16" cy="18" r="1.5" />
                            </svg>
                          </div>
                        </div>
                      )}

                      {/* List Marker */}
                      <div className="flex items-center justify-center w-6 h-7 flex-shrink-0">
                        {item.type === "checkbox" && (
                          <button
                            onClick={() => toggleCheckbox(item.id)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 hover:scale-105 ${
                              item.completed
                                ? "bg-[#FFAA00] border-[#FFAA00] shadow-lg shadow-[#FFAA00]/25"
                                : "border-gray-500 hover:border-[#FFAA00] bg-transparent"
                            }`}
                          >
                            {item.completed && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-black">
                                <path
                                  d="M20 6L9 17l-5-5"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        )}
                        {item.type === "bullet" && <div className="w-2 h-2 rounded-full bg-gray-400"></div>}
                        {item.type === "number" && (
                          <div className="text-gray-400 font-mono text-sm w-6 text-right">
                            {getNumberedIndex(index)}.
                          </div>
                        )}
                      </div>

                      {/* Content Input */}
                      <div className="flex-1 min-w-0">
                        <textarea
                          ref={(el) => {
                            if (el) inputRefs.current[item.id] = el;
                          }}
                          value={item.content}
                          onChange={(e) => {
                            const value = e.target.value;
                            handleContentChange(item.id, value);
                            // Only check for formatting on text items
                            if (item.type === "text") {
                              handleInput(item.id, value);
                            }
                          }}
                          onKeyDown={(e) => handleKeyDown(e, item.id)}
                          onFocus={() => {}}
                          onPointerDown={(e) => e.stopPropagation()}
                          placeholder={index === 0 ? "Start writing..." : ""}
                          className={`w-full bg-transparent text-white placeholder-gray-500 border-none outline-none resize-none font-medium leading-relaxed ${
                            item.completed ? "line-through text-gray-400" : ""
                          }`}
                          style={{
                            minHeight: "28px",
                            lineHeight: "1.75",
                            fontSize: "16px",
                          }}
                          rows={1}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer with shortcuts - only show when no content */}
              {notes.length === 1 && notes[0].content === "" && (
                <div className="px-6 py-4 border-t border-gray-800/50 bg-gray-900/30">
                  <div className="flex flex-col items-center justify-center text-xs text-gray-500 gap-3">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-1">
                        <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">[]</span>
                        <span>Checkbox</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">-</span>
                        <span>Bullet</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">1.</span>
                        <span>Number</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
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
  const dispatch = useDispatch<AppDispatch>();
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const taskSliceState = useSelector((state: RootState) => state.tasks);
  const reduxUser = useSelector((state: RootState) => state.user);

  // Console log the entire taskSlice state
  useEffect(() => {
    // State monitoring removed
  }, [taskSliceState]);

  // Convert Redux tasks to the format expected by this component
  const tasks: Task[] = reduxTasks.map((task) => ({
    id: task.id,
    text: task.name,
    completed: task.completed,
    order: 0, // Not used in Redux version
    timeSpent: task.timeSpent, // Include the timeSpent from Redux
  }));

  const [newTaskText, setNewTaskText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const [showClearMenu, setShowClearMenu] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // TODO: Replace with Firebase RTDB refresh
  // Function to manually refresh tasks from Firebase
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const refreshTasks = () => {
    if (!user?.id) return;
    // const tasksRef = ref(rtdb, `users/${user.id}/tasks`);
    // onValue(
    //   tasksRef,
    //   (snapshot) => {
    //     const tasksData = snapshot.val();
    //     if (tasksData) {
    //       const tasksArray = Object.entries(tasksData).map(([id, task]) => ({
    //         id,
    //         ...(task as Omit<Task, "id">),
    //       }));
    //       tasksArray.sort((a, b) => (a.order || 0) - (b.order || 0));
    //       setTasks(tasksArray);
    //     } else {
    //       setTasks([]);
    //     }
    //   },
    //   { onlyOnce: true }
    // );

    // Temporary: No refresh needed with local state
    // Tasks are now managed by Redux
  };

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

  // TODO: Replace with Firebase RTDB listener for tasks
  // Load tasks from Firebase (user-specific)
  useEffect(() => {
    if (!user?.id) return;

    // const tasksRef = ref(rtdb, `users/${user.id}/tasks`);
    // const handle = onValue(tasksRef, (snapshot) => {
    //   const tasksData = snapshot.val();
    //   if (tasksData) {
    //     // Convert Firebase object to array and sort by order
    //     const tasksArray = Object.entries(tasksData).map(([id, task]) => ({
    //       id,
    //       ...(task as Omit<Task, "id">),
    //     }));
    //     // Sort by order field, or fallback to creation order
    //     tasksArray.sort((a, b) => (a.order || 0) - (b.order || 0));

    //     // Only update tasks if no task is currently being edited
    //     // This prevents Firebase updates from interfering with local editing state
    //     if (!editingId) {
    //       setTasks(tasksArray);
    //     }
    //   } else {
    //     setTasks([]);
    //   }
    // });

    // return () => {
    //   off(tasksRef, "value", handle);
    // };

    // Tasks are now managed by Redux
  }, [user?.id, tasks.length]);

  // Focus input when opening - but not if it was opened via sidebar mode
  // This prevents stealing focus from the main task input
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Only focus if the TaskList was opened via Cmd+K or the button
      // Not when opened automatically from TaskInput in sidebar mode
      const isManualOpen = !document.querySelector('textarea[placeholder="What are you focusing on?"]:focus');
      if (isManualOpen) {
        inputRef.current.focus();
      }
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

  // Add task to Redux store
  const handleAddTask = () => {
    if (newTaskText.trim() && user?.id && reduxUser.user_id) {
      // Generate proper UUID
      const taskId = uuidv4();

      // Add optimistic task immediately
      dispatch(
        addTask({
          id: taskId,
          name: newTaskText.trim(),
        })
      );

      // Persist to database using PostgreSQL user ID
      dispatch(
        createTaskThunk({
          id: taskId,
          name: newTaskText.trim(),
          userId: reduxUser.user_id, // Use PostgreSQL UUID
        })
      );

      setNewTaskText("");
    }
  };

  // Remove task from Redux store and database
  const removeTask = (id: string) => {
    if (user?.id && reduxUser.user_id) {
      // First remove from Redux optimistically
      dispatch(deleteTask(id));

      // Then delete from database and Firebase TaskBuffer
      dispatch(
        deleteTaskThunk({
          id,
          userId: reduxUser.user_id,
          firebaseUserId: user.id, // Firebase Auth ID
        })
      );
    }
  };

  const startEditing = (task: Task) => {
    setEditingId(task.id);
    setEditingText(task.text);
  };

  // Update task in Redux store
  const saveEdit = () => {
    if (editingText.trim() && editingId && user?.id) {
      dispatch(
        updateTask({
          id: editingId,
          updates: { name: editingText.trim() },
        })
      );
      setEditingId(null);
      setEditingText("");
    } else if (!editingText.trim() && editingId) {
      // If the text is empty, cancel the edit without saving
      setEditingId(null);
      setEditingText("");
    }
  };

  const handleToggleExpanded = (taskId: string) => {
    setExpandedTaskId(expandedTaskId === taskId ? null : taskId);
  };

  // Auto-scroll when task is expanded
  useEffect(() => {
    if (expandedTaskId) {
      setTimeout(() => {
        const element = document.querySelector(`[data-task-id="${expandedTaskId}"]`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 100);
    }
  }, [expandedTaskId]);

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
    // Force refresh tasks from Firebase after cancelling edit
    // refreshTasks();
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  // Update task order in Redux store
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id && user?.id) {
      const oldIndex = reduxTasks.findIndex((item) => item.id === active.id);
      const newIndex = reduxTasks.findIndex((item) => item.id === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedTasks = arrayMove([...reduxTasks], oldIndex, newIndex);
        
        // Update Redux state optimistically
        dispatch(reorderTasks(reorderedTasks));
        
        // Persist the new order to database
        if (typeof window !== "undefined") {
          const token = localStorage.getItem("firebase_token") || "";
          
          // Calculate which tasks need order updates
          const updates = reorderedTasks
            .map((task, index) => ({
              taskId: task.id,
              order: index
            }))
            .filter((update, index) => {
              // Only send updates for tasks whose order changed
              const originalTask = reduxTasks.find(t => t.id === update.taskId);
              return originalTask && originalTask.order !== index;
            });
          
          if (updates.length > 0) {
            dispatch(updateTaskOrder({ updates, token }));
          }
        }
      }
    }

    setActiveId(null);
  };

  const clearAll = () => {
    setShowClearMenu(false);
    setShowClearAllConfirm(true);
  };

  // Clear all tasks from Redux store
  const confirmClearAll = () => {
    if (user?.id) {
      // Clear all tasks by deleting each one
      reduxTasks.forEach((task) => {
        dispatch(deleteTask(task.id));
      });
    }
    setShowClearAllConfirm(false);
  };

  // Only show incomplete tasks
  const filteredTasks = tasks.filter((task) => !task.completed);

  const incompleteTasks = tasks.filter((task) => !task.completed).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] pointer-events-none animate-in fade-in duration-300">
      {/* Click-outside-to-close backdrop */}
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />

      <div
        className="absolute bottom-4 right-4 w-[480px] max-w-[calc(100vw-2rem)] sm:max-w-[480px] max-h-[calc(100vh-8rem)] bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-gray-800">
          <div className="flex items-center justify-between p-6 pb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-white">Task List</h2>
              <span className="text-sm text-gray-500 font-medium">⌘K</span>
            </div>
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
                    handleAddTask();
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
              onClick={handleAddTask}
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
                      isExpanded={expandedTaskId === task.id}
                      onToggleExpanded={handleToggleExpanded}
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
        <div className="fixed inset-0 z-[80] pointer-events-none animate-in fade-in duration-300">
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
