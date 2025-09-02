// Local storage cache for guest users' counter/pomodoro state
interface CounterState {
  count: number;
  lastUpdated: number;
}

interface TaskCounters {
  [taskId: string]: CounterState;
}

class LocalCounterCache {
  private static STORAGE_KEY = 'locked_in_guest_counters'; // Changed to plural for multiple counters

  static getCounter(taskId?: string | null): number {
    if (typeof window === 'undefined') {
      console.log('[LocalCounterCache] Window undefined, returning 0');
      return 0;
    }
    
    if (!taskId) {
      console.log('[LocalCounterCache] No taskId provided, returning 0');
      return 0;
    }
    
    try {
      const cached = localStorage.getItem(this.STORAGE_KEY);
      console.log('[LocalCounterCache] Raw cached value:', cached);
      
      if (!cached) {
        console.log('[LocalCounterCache] No cached value found, returning 0');
        return 0;
      }
      
      const counters: TaskCounters = JSON.parse(cached);
      console.log('[LocalCounterCache] All counters:', counters);
      
      const taskCounter = counters[taskId];
      if (!taskCounter) {
        console.log(`[LocalCounterCache] No counter for task ${taskId}, returning 0`);
        return 0;
      }
      
      const value = taskCounter.count || 0;
      console.log(`[LocalCounterCache] Returning counter value for task ${taskId}:`, value);
      return value;
    } catch (error) {
      console.error('[LocalCounterCache] Error reading counter from cache:', error);
      return 0;
    }
  }

  static saveCounter(taskId: string | null, count: number): void {
    if (typeof window === 'undefined') {
      console.log('[LocalCounterCache] Cannot save - window undefined');
      return;
    }
    
    if (!taskId) {
      console.log('[LocalCounterCache] Cannot save - no taskId provided');
      return;
    }
    
    try {
      // Get existing counters
      const cached = localStorage.getItem(this.STORAGE_KEY);
      const counters: TaskCounters = cached ? JSON.parse(cached) : {};
      
      // Update counter for this task
      counters[taskId] = {
        count,
        lastUpdated: Date.now()
      };
      
      console.log(`[LocalCounterCache] Saving counter for task ${taskId}:`, count);
      console.log('[LocalCounterCache] All counters:', counters);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(counters));
      
      // Verify it was saved
      const verification = localStorage.getItem(this.STORAGE_KEY);
      console.log('[LocalCounterCache] Verification after save:', verification);
    } catch (error) {
      console.error('[LocalCounterCache] Error saving counter to cache:', error);
    }
  }

  static clearAllCounters(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing counter cache:', error);
    }
  }
}

export default LocalCounterCache;