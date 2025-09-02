// Local task cache for guest users
// This provides instant task management for guests with localStorage persistence

import type { Task } from "../store/taskSlice";

const CACHE_KEY = "locked_in_guest_tasks";

export class LocalTaskCache {
  // Get all cached tasks
  static getTasks(): Task[] {
    if (typeof window === "undefined") return [];
    
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return [];
      
      const tasks = JSON.parse(cached);
      // Ensure tasks have all required fields
      return tasks.map((task: any) => ({
        id: task.id || `local_${Date.now()}_${Math.random()}`,
        name: task.name || "",
        completed: task.completed || false,
        timeSpent: task.timeSpent || 0,
        lastActive: task.lastActive,
        createdAt: task.createdAt || Date.now(),
        completedAt: task.completedAt,
        status: task.status || "not_started",
        order: task.order ?? 0,
        counter: task.counter || 0,
      }));
    } catch {
      return [];
    }
  }

  // Save tasks to cache
  static saveTasks(tasks: Task[]): void {
    if (typeof window === "undefined") return;
    
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(tasks));
    } catch {
      // Silent failure - cache is best effort
    }
  }

  // Add a new task
  static addTask(name: string): Task {
    const tasks = this.getTasks();
    const maxOrder = tasks.reduce((max, task) => Math.max(max, task.order), -1);
    
    const newTask: Task = {
      id: `local_${Date.now()}_${Math.random()}`,
      name,
      completed: false,
      timeSpent: 0,
      createdAt: Date.now(),
      status: "not_started",
      order: maxOrder + 1,
      counter: 0,
    };
    
    tasks.push(newTask);
    this.saveTasks(tasks);
    return newTask;
  }

  // Update a task
  static updateTask(id: string, updates: Partial<Task>): void {
    const tasks = this.getTasks();
    const taskIndex = tasks.findIndex(task => task.id === id);
    
    if (taskIndex !== -1) {
      tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
      this.saveTasks(tasks);
    }
  }

  // Delete a task
  static deleteTask(id: string): void {
    const tasks = this.getTasks();
    const filtered = tasks.filter(task => task.id !== id);
    this.saveTasks(filtered);
  }

  // Clear all cached tasks (used when user signs in)
  static clearCache(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(CACHE_KEY);
  }

  // Check if cache exists
  static hasCache(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(CACHE_KEY) !== null;
  }
}