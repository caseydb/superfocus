"use client";
import React, { useState, useRef, useEffect } from "react";
import { useInstance } from "../Instances";
import { useAppDispatch, useAppSelector } from "@/app/store/hooks";
import { 
  setNotes, 
  updateNote, 
  addNote, 
  removeNote, 
  reorderNotes, 
  toggleCheckbox as toggleCheckboxAction,
  selectNotesByTaskId,
  selectIsSavingByTaskId,
  selectErrorByTaskId,
  selectIsLoadingByTaskId,
  selectHasNotesForTaskId
} from "@/app/store/notesSlice";
import { fetchNotes, saveNotes } from "@/app/store/notesThunks";

interface NoteItem {
  id: string;
  type: "text" | "checkbox" | "bullet" | "number";
  content: string;
  completed?: boolean;
  level: number; // for indentation
}

// Note: This interface is no longer used since we're storing notes directly
// interface NoteData {
//   id: string;
//   items: NoteItem[];
//   taskId?: string | null;
//   taskText?: string | null;
//   lastUpdated: number;
//   userId: string;
// }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function Notes({ isOpen, task, taskId }: { isOpen: boolean; task: string; taskId?: string | null }) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user } = useInstance();
  const [mounted, setMounted] = useState(false);
  const dispatch = useAppDispatch();
  const notes = useAppSelector(selectNotesByTaskId(taskId));
  const isSaving = useAppSelector(selectIsSavingByTaskId(taskId));
  const saveError = useAppSelector(selectErrorByTaskId(taskId));
  const isLoading = useAppSelector(selectIsLoadingByTaskId(taskId));
  const hasNotesInStore = useAppSelector(selectHasNotesForTaskId(taskId));
  
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<number>(2);
  const [isMac, setIsMac] = useState(false);
  const inputRefs = useRef<{ [key: string]: HTMLTextAreaElement }>({});

  // Set focus only when Notes is explicitly opened
  const prevIsOpen = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      // Notes just opened, set focus to first item
      setFocusedId(notes[0]?.id || null);
    }
    if (!isOpen) {
      setFocusedId(null);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, notes]);

  // Ensure component is mounted on client side and detect OS
  useEffect(() => {
    setMounted(true);
    setIsMac(navigator.platform.toUpperCase().indexOf("MAC") >= 0);
  }, []);

  // Load notes from database when taskId changes
  useEffect(() => {
    if (!mounted || !taskId || hasNotesInStore) return;
    
    dispatch(fetchNotes(taskId));
  }, [mounted, taskId, hasNotesInStore, dispatch]);

  // Initialize empty notes if none exist after fetch
  useEffect(() => {
    if (mounted && taskId && notes.length === 0 && hasNotesInStore && !isLoading) {
      dispatch(setNotes({ taskId, notes: [{ id: "1", type: "text", content: "", level: 0 }] }));
    }
  }, [mounted, taskId, notes.length, hasNotesInStore, isLoading, dispatch]);

  // Update nextId when notes change
  useEffect(() => {
    if (notes.length > 0) {
      const maxId = Math.max(...notes.map((item) => parseInt(item.id)), 0);
      setNextId(maxId + 1);
    }
  }, [notes]);

  // Save notes to database manually
  const saveNotesToDB = async () => {
    if (!mounted || !taskId) return;
    dispatch(saveNotes({ taskId, notes }));
  };

  // Auto-resize textarea
  const autoResize = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(28, textarea.scrollHeight)}px`;
  };

  // Handle input changes
  const handleContentChange = (id: string, value: string) => {
    if (!taskId) return;
    dispatch(updateNote({ taskId, noteId: id, updates: { content: value } }));

    // Auto-resize
    const textarea = inputRefs.current[id];
    if (textarea) {
      autoResize(textarea);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    const item = notes.find((item) => item.id === id);
    if (item?.type !== "checkbox") {
      e.preventDefault();
      return;
    }
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    const item = notes.find((item) => item.id === id);
    if (item?.type !== "checkbox") {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
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

    if (!taskId) return;
    dispatch(reorderNotes({ taskId, notes: newItems }));
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  // Handle key down events for formatting and navigation
  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
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
        if (!taskId) return;
        dispatch(updateNote({ taskId, noteId: id, updates: { type: "text", completed: false } }));
        return;
      }
      const newItem: NoteItem = {
        id: newId,
        type: newType,
        content: "",
        level: newLevel,
      };

      if (!taskId) return;
      dispatch(addNote({ taskId, note: newItem }));
      setFocusedId(newId);

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

      // Remove current item and focus previous
      if (!taskId) return;
      dispatch(removeNote({ taskId, noteId: id }));

      if (currentIndex > 0) {
        const prevId = notes[currentIndex - 1].id;
        setFocusedId(prevId);
        setTimeout(() => {
          const prevTextarea = inputRefs.current[prevId];
          if (prevTextarea) {
            prevTextarea.focus();
            prevTextarea.setSelectionRange(prevTextarea.value.length, prevTextarea.value.length);
          }
        }, 0);
      }
    }

    // If only one item left and it's not text, convert to text instead of deleting
    if (e.key === "Backspace" && currentItem.content === "" && notes.length === 1 && currentItem.type !== "text") {
      e.preventDefault();
      if (!taskId) return;
      dispatch(updateNote({ taskId, noteId: currentItem.id, updates: { type: "text", completed: false } }));
    }

    if (e.key === "Tab") {
      e.preventDefault();

      // Increase/decrease indentation
      const newLevel = e.shiftKey ? Math.max(0, currentItem.level - 1) : Math.min(3, currentItem.level + 1);

      if (!taskId) return;
      dispatch(updateNote({ taskId, noteId: id, updates: { level: newLevel } }));
    }

    if (e.key === "ArrowUp" && currentIndex > 0) {
      e.preventDefault();
      const prevId = notes[currentIndex - 1].id;
      inputRefs.current[prevId]?.focus();
      setFocusedId(prevId);
    }

    if (e.key === "ArrowDown" && currentIndex < notes.length - 1) {
      e.preventDefault();
      const nextId = notes[currentIndex + 1].id;
      inputRefs.current[nextId]?.focus();
      setFocusedId(nextId);
    }
  };

  // Handle input events for auto-formatting
  const handleInput = (id: string, value: string) => {
    const item = notes.find((item) => item.id === id);
    if (!item || !taskId) return;

    let newType = item.type;
    let newContent = value;

    // Auto-format based on input
    if (value.startsWith("[]") && (value.length === 2 || value[2] !== "[")) {
      newType = "checkbox";
      newContent = value.slice(2).replace(/^\s*/, "");
    } else if (value.startsWith("[x] ") || value.startsWith("[X] ")) {
      newType = "checkbox";
      newContent = value.slice(4);
      // Toggle completed state
      dispatch(updateNote({ 
        taskId, 
        noteId: id, 
        updates: { type: newType, content: newContent, completed: true } 
      }));
      return;
    } else if (value.startsWith("- ")) {
      newType = "bullet";
      newContent = value.slice(2);
    } else if (/^\d+\.\s/.test(value)) {
      newType = "number";
      newContent = value.replace(/^\d+\.\s/, "");
    }

    dispatch(updateNote({ 
      taskId, 
      noteId: id, 
      updates: { type: newType, content: newContent } 
    }));
  };

  // Toggle checkbox
  const toggleCheckbox = (id: string) => {
    if (!taskId) return;
    
    dispatch(toggleCheckboxAction({ taskId, noteId: id }));
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

  useEffect(() => {
    // Focus the focused item - only when Notes is explicitly opened
    if (isOpen && focusedId && typeof window !== "undefined" && inputRefs.current[focusedId]) {
      const textarea = inputRefs.current[focusedId];
      setTimeout(() => {
        textarea.focus();
        autoResize(textarea);
      }, 0);
    }
  }, [focusedId, notes, isOpen]);

  if (!isOpen || !mounted) return null;

  // If no taskId is available, show a message
  if (!taskId) {
    return (
      <div className="w-full min-w-[650px] bg-gray-900 rounded-2xl shadow-xl border border-gray-800 overflow-hidden mb-6">
        <div className="p-6 text-center text-gray-400">
          <p>Save this task to your task list to enable notes.</p>
          <p className="text-sm mt-2">Notes will sync between here and your task list.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-[650px] bg-gray-900 rounded-2xl shadow-xl border border-gray-800 overflow-hidden mb-6">
      {/* Header with Save Button */}
      <div className="px-6 py-3 bg-gray-800/50 border-b border-gray-700 flex items-center justify-between">
        <div className="text-sm text-gray-400">
          Notes for this task
        </div>
        <button
          onClick={saveNotesToDB}
          disabled={isSaving || !taskId}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            isSaving
              ? "bg-gray-700 text-gray-400 cursor-not-allowed"
              : saveError
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "bg-[#FFAA00] hover:bg-[#FF9900] text-black"
          }`}
        >
          {isSaving ? (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
              <span>Saving...</span>
            </div>
          ) : saveError ? (
            "Retry Save"
          ) : (
            "Save Notes"
          )}
        </button>
      </div>

      {/* Error Message */}
      {saveError && (
        <div className="px-6 py-2 bg-red-900/20 border-b border-red-800/30">
          <p className="text-sm text-red-400">{saveError}</p>
        </div>
      )}
      
      {/* Notes Content */}
      <div className="p-6 max-h-[40vh] overflow-y-auto custom-scrollbar">
        <div className="space-y-2">
          {notes.map((item, index) => (
            <div
              key={item.id}
              className={`flex items-start gap-3 group transition-all duration-200 ${
                draggedId === item.id ? "opacity-50 scale-95" : ""
              } ${dragOverId === item.id ? "bg-gray-800/30 rounded-lg" : ""}`}
              draggable={item.type === "checkbox"}
              onDragStart={(e) => handleDragStart(e, item.id)}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, item.id)}
              onDragEnd={handleDragEnd}
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
                  <div className="text-gray-400 font-mono text-sm w-6 text-right">{getNumberedIndex(index)}.</div>
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
                    handleContentChange(item.id, e.target.value);
                    handleInput(item.id, e.target.value);
                  }}
                  onKeyDown={(e) => handleKeyDown(e, item.id)}
                  onFocus={() => setFocusedId(item.id)}
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
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/30">
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
              <div className="flex items-center gap-2">
                <span className="px-4 py-1 bg-gray-800 rounded text-gray-300">1.</span>
                <span>Number</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">{isMac ? "⌘J" : "Ctrl+J"}</span>
                <span>Toggle Notes</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
