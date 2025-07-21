import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface NoteItem {
  id: string;
  type: "text" | "checkbox" | "bullet" | "number";
  content: string;
  completed?: boolean;
  level: number;
}

interface NotesState {
  notesByTaskId: Record<string, NoteItem[]>;
  loading: Record<string, boolean>;
  saving: Record<string, boolean>;
  errors: Record<string, string | null>;
}

const initialState: NotesState = {
  notesByTaskId: {},
  loading: {},
  saving: {},
  errors: {},
};

const notesSlice = createSlice({
  name: 'notes',
  initialState,
  reducers: {
    // Set notes for a task
    setNotes: (state, action: PayloadAction<{ taskId: string; notes: NoteItem[] }>) => {
      const { taskId, notes } = action.payload;
      state.notesByTaskId[taskId] = notes;
      state.errors[taskId] = null;
    },

    // Update a single note
    updateNote: (state, action: PayloadAction<{ taskId: string; noteId: string; updates: Partial<NoteItem> }>) => {
      const { taskId, noteId, updates } = action.payload;
      const notes = state.notesByTaskId[taskId];
      if (notes) {
        const noteIndex = notes.findIndex(note => note.id === noteId);
        if (noteIndex !== -1) {
          state.notesByTaskId[taskId][noteIndex] = { ...notes[noteIndex], ...updates };
        }
      }
    },

    // Add a new note
    addNote: (state, action: PayloadAction<{ taskId: string; note: NoteItem }>) => {
      const { taskId, note } = action.payload;
      if (!state.notesByTaskId[taskId]) {
        state.notesByTaskId[taskId] = [];
      }
      state.notesByTaskId[taskId].push(note);
    },

    // Remove a note
    removeNote: (state, action: PayloadAction<{ taskId: string; noteId: string }>) => {
      const { taskId, noteId } = action.payload;
      const notes = state.notesByTaskId[taskId];
      if (notes) {
        state.notesByTaskId[taskId] = notes.filter(note => note.id !== noteId);
      }
    },

    // Reorder notes
    reorderNotes: (state, action: PayloadAction<{ taskId: string; notes: NoteItem[] }>) => {
      const { taskId, notes } = action.payload;
      state.notesByTaskId[taskId] = notes;
    },

    // Toggle checkbox completion
    toggleCheckbox: (state, action: PayloadAction<{ taskId: string; noteId: string }>) => {
      const { taskId, noteId } = action.payload;
      const notes = state.notesByTaskId[taskId];
      if (notes) {
        const note = notes.find(n => n.id === noteId);
        if (note && note.type === 'checkbox') {
          note.completed = !note.completed;
        }
      }
    },

    // Set loading state
    setLoading: (state, action: PayloadAction<{ taskId: string; loading: boolean }>) => {
      const { taskId, loading } = action.payload;
      state.loading[taskId] = loading;
    },

    // Set saving state
    setSaving: (state, action: PayloadAction<{ taskId: string; saving: boolean }>) => {
      const { taskId, saving } = action.payload;
      state.saving[taskId] = saving;
    },

    // Set error state
    setError: (state, action: PayloadAction<{ taskId: string; error: string | null }>) => {
      const { taskId, error } = action.payload;
      state.errors[taskId] = error;
    },

    // Clear notes for a task
    clearNotes: (state, action: PayloadAction<string>) => {
      const taskId = action.payload;
      delete state.notesByTaskId[taskId];
      delete state.loading[taskId];
      delete state.saving[taskId];
      delete state.errors[taskId];
    },
  },
});

export const {
  setNotes,
  updateNote,
  addNote,
  removeNote,
  reorderNotes,
  toggleCheckbox,
  setLoading,
  setSaving,
  setError,
  clearNotes,
} = notesSlice.actions;

export default notesSlice.reducer;

// Memoized selectors
const EMPTY_NOTES: NoteItem[] = [];

export const selectNotesByTaskId = (taskId: string | null | undefined) => (state: { notes: NotesState }) => {
  if (!taskId) return EMPTY_NOTES;
  return state.notes.notesByTaskId[taskId] || EMPTY_NOTES;
};

export const selectIsSavingByTaskId = (taskId: string | null | undefined) => (state: { notes: NotesState }) => {
  if (!taskId) return false;
  return state.notes.saving[taskId] || false;
};

export const selectErrorByTaskId = (taskId: string | null | undefined) => (state: { notes: NotesState }) => {
  if (!taskId) return null;
  return state.notes.errors[taskId] || null;
};

export const selectIsLoadingByTaskId = (taskId: string | null | undefined) => (state: { notes: NotesState }) => {
  if (!taskId) return false;
  return state.notes.loading[taskId] || false;
};

export const selectHasNotesForTaskId = (taskId: string | null | undefined) => (state: { notes: NotesState }) => {
  if (!taskId) return false;
  return taskId in state.notes.notesByTaskId;
};