"use client";
import React, { useEffect, useState, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { 
  selectNotesByTaskId, 
  selectHasNotesForTaskId, 
  setNotes,
  updateNote,
  addNote,
  removeNote,
  toggleCheckbox as toggleCheckboxAction
} from "../../store/notesSlice";
import { fetchNotes, saveNotes as saveNotesThunk } from "../../store/notesThunks";

interface NoteItem {
  id: string;
  type: "text" | "checkbox" | "bullet" | "number";
  content: string;
  completed?: boolean;
  level: number;
}

interface TaskNotesProps {
  taskId?: string | null;
  taskName?: string;
  isVisible?: boolean;
  customWidth?: string;
  customMinHeight?: string;
}

export default function TaskNotes({ taskId, isVisible = true, customWidth, customMinHeight }: TaskNotesProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [nextId, setNextId] = useState<number>(2);
  const inputRefs = useRef<{ [key: string]: HTMLTextAreaElement }>({});
  
  // Get notes from Redux store using the same selector as TaskList
  const notes = useSelector((state: RootState) => 
    taskId ? selectNotesByTaskId(taskId)(state) : []
  );
  const hasNotesInStore = useSelector((state: RootState) => 
    taskId ? selectHasNotesForTaskId(taskId)(state) : false
  );

  // Load notes when component mounts or taskId changes
  useEffect(() => {
    if (!taskId || !isVisible) return;
    
    // Always fetch notes when taskId changes
    dispatch(fetchNotes(taskId));
  }, [taskId, isVisible, dispatch]);

  // Initialize empty notes if none exist after fetch
  useEffect(() => {
    if (!isVisible || !taskId) return;
    
    // If we have fetched (hasNotesInStore is true) but no notes exist, create empty note
    if (hasNotesInStore && notes.length === 0) {
      dispatch(setNotes({ taskId, notes: [{ id: "1", type: "text", content: "", level: 0 }] }));
    }
  }, [taskId, notes.length, hasNotesInStore, isVisible, dispatch]);

  // Update nextId when notes change
  useEffect(() => {
    if (notes.length > 0) {
      const maxId = Math.max(...notes.map((item) => parseInt(item.id)), 0);
      setNextId(maxId + 1);
    }
  }, [notes]);

  // Auto-save notes after 5 seconds of inactivity
  useEffect(() => {
    if (!taskId || notes.length === 0 || !hasNotesInStore || !isVisible) return;

    const timeoutId = setTimeout(() => {
      dispatch(saveNotesThunk({ taskId, notes }));
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [taskId, notes, hasNotesInStore, isVisible, dispatch]);

  // Auto-resize textarea
  const autoResize = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(28, textarea.scrollHeight)}px`;
  };

  // Handle content changes in notes
  const handleContentChange = (id: string, value: string) => {
    if (!taskId) return;
    dispatch(updateNote({ taskId, noteId: id, updates: { content: value } }));

    // Auto-resize
    const textarea = inputRefs.current[id];
    if (textarea) {
      autoResize(textarea);
    }
  };

  // Toggle checkbox
  const toggleCheckbox = (id: string) => {
    if (!taskId) return;
    dispatch(toggleCheckboxAction({ taskId, noteId: id }));
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
      if (!taskId) return;
      dispatch(removeNote({ taskId, noteId: id }));

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
      if (!taskId) return;
      dispatch(updateNote({ taskId, noteId: currentItem.id, updates: { type: "text", completed: false } }));
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const newLevel = e.shiftKey ? Math.max(0, currentItem.level - 1) : Math.min(3, currentItem.level + 1);
      if (!taskId) return;
      dispatch(updateNote({ taskId, noteId: id, updates: { level: newLevel } }));
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
    if (!item || !taskId) return;

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
          taskId, 
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
        taskId, 
        noteId: id, 
        updates: { type: newType, content: newContent } 
      }));
    }
  };

  // Helper to get numbered list number (same as TaskList)
  const getNumberedIndex = (currentIndex: number): number => {
    let count = 1;
    for (let i = 0; i < currentIndex; i++) {
      if (notes[i].type === "number" && notes[i].level === notes[currentIndex].level) {
        count++;
      }
    }
    return count;
  };

  if (!isVisible) return null;

  // Match TaskInput's minimum width (most common case)
  const getWidth = () => {
    if (customWidth) return customWidth;
    
    if (typeof window !== "undefined") {
      const screenWidth = window.innerWidth;
      if (screenWidth >= 768) {
        return "615px"; // Desktop width - 65px wider total
      } else if (screenWidth >= 640) {
        return "465px"; // Tablet width - 65px wider total
      }
    }
    return "95%"; // Mobile width
  };

  return (
    <div 
      className="animate-in fade-in slide-in-from-bottom-2 duration-300" 
      style={{ 
        width: getWidth(), 
        height: customMinHeight || 'auto',
        minHeight: customMinHeight 
      }}
    >
      <div className="bg-gray-850 rounded-xl border border-gray-700 overflow-hidden h-full flex flex-col">
        {/* Notes Content Only */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          <div className="space-y-2">
            {notes.map((item, index) => (
              <div
                key={item.id}
                className="flex items-start gap-3 group transition-all duration-200"
                style={{ paddingLeft: `${item.level * 24}px` }}
              >
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
      </div>
    </div>
  );
}