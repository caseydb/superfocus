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
      return 0;
    }
    
    if (!taskId) {
      return 0;
    }
    
    try {
      const cached = localStorage.getItem(this.STORAGE_KEY);
      
      if (!cached) {
        return 0;
      }
      
      const counters: TaskCounters = JSON.parse(cached);
      
      const taskCounter = counters[taskId];
      if (!taskCounter) {
        return 0;
      }
      
      const value = taskCounter.count || 0;
      return value;
    } catch (error) {
      return 0;
    }
  }

  static saveCounter(taskId: string | null, count: number): void {
    if (typeof window === 'undefined') {
      return;
    }
    
    if (!taskId) {
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
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(counters));
      
    } catch (error) {
    }
  }

  static clearAllCounters(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
    }
  }
}

export default LocalCounterCache;