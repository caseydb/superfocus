import { createAsyncThunk } from '@reduxjs/toolkit';
import { setNotes, setLoading, setSaving, setError } from './notesSlice';
import LocalNotesCache from '@/app/utils/localNotesCache';
import { RootState } from './store';

interface NoteItem {
  id: string;
  type: "text" | "checkbox" | "bullet" | "number";
  content: string;
  completed?: boolean;
  level: number;
}

// Fetch notes for a task
export const fetchNotes = createAsyncThunk(
  'notes/fetchNotes',
  async (taskId: string, { dispatch, getState }) => {
    try {
      dispatch(setLoading({ taskId, loading: true }));
      
      // Check if user is guest
      const state = getState() as RootState;
      const isGuest = state.user.isGuest;
      
      if (isGuest) {
        // For guest users, get notes from local cache
        const cachedNotes = LocalNotesCache.getNotes(taskId);
        dispatch(setNotes({ taskId, notes: cachedNotes }));
        return cachedNotes;
      }
      
      // For authenticated users, fetch from API
      const response = await fetch(`/api/note?taskId=${taskId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch notes');
      }
      
      const data = await response.json();
      dispatch(setNotes({ taskId, notes: data.items || [] }));
      
      return data.items || [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch notes';
      dispatch(setError({ taskId, error: errorMessage }));
      throw error;
    } finally {
      dispatch(setLoading({ taskId, loading: false }));
    }
  }
);

// Save notes for a task
export const saveNotes = createAsyncThunk(
  'notes/saveNotes',
  async ({ taskId, notes }: { taskId: string; notes: NoteItem[] }, { dispatch, getState }) => {
    try {
      dispatch(setSaving({ taskId, saving: true }));
      dispatch(setError({ taskId, error: null }));
      
      // Check if user is guest
      const state = getState() as RootState;
      const isGuest = state.user.isGuest;
      
      if (isGuest) {
        // For guest users, save to local cache
        LocalNotesCache.saveNotes(taskId, notes);
        return { success: true, message: 'Notes cached locally' };
      }
      
      // For authenticated users, save to API
      const response = await fetch('/api/note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId,
          items: notes.map((item, index) => ({
            ...item,
            index,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save notes');
      }

      return await response.json();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save notes';
      dispatch(setError({ taskId, error: errorMessage }));
      throw error;
    } finally {
      dispatch(setSaving({ taskId, saving: false }));
    }
  }
);