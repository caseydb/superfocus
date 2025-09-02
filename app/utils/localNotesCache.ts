// Local storage cache for guest users' notes
interface NoteItem {
  id: string;
  type: "text" | "checkbox" | "bullet" | "number";
  content: string;
  completed?: boolean;
  level: number;
}

interface NotesCache {
  [taskId: string]: NoteItem[];
}

class LocalNotesCache {
  private static STORAGE_KEY = 'locked_in_guest_notes';

  static getNotes(taskId: string): NoteItem[] {
    if (typeof window === 'undefined') return [];
    
    try {
      const cached = localStorage.getItem(this.STORAGE_KEY);
      if (!cached) return [];
      
      const notesCache: NotesCache = JSON.parse(cached);
      return notesCache[taskId] || [];
    } catch (error) {
      console.error('Error reading notes from cache:', error);
      return [];
    }
  }

  static saveNotes(taskId: string, notes: NoteItem[]): void {
    if (typeof window === 'undefined') return;
    
    try {
      const cached = localStorage.getItem(this.STORAGE_KEY);
      const notesCache: NotesCache = cached ? JSON.parse(cached) : {};
      
      notesCache[taskId] = notes;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(notesCache));
    } catch (error) {
      console.error('Error saving notes to cache:', error);
    }
  }

  static clearAll(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing notes cache:', error);
    }
  }
}

export default LocalNotesCache;