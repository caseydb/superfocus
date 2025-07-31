import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import { rtdb } from "@/lib/firebase";
import { ref, set, remove, get, update } from "firebase/database";

export interface Task {
  id: string;
  name: string;
  completed: boolean;
  timeSpent: number;
  lastActive?: number;
  createdAt: number;
  completedAt?: number;
  status: "not_started" | "in_progress" | "paused" | "completed" | "quit";
  isOptimistic?: boolean; // Track if this is a temporary optimistic task
  order: number; // Position in the task list
}

interface TaskState {
  tasks: Task[];
  activeTaskId: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: TaskState = {
  tasks: [],
  activeTaskId: null,
  loading: false,
  error: null,
};

// Thunk for adding a task to Firebase TaskBuffer when it's started
export const addTaskToBufferWhenStarted = createAsyncThunk(
  "tasks/addToBufferWhenStarted",
  async ({
    id,
    name,
    userId,
    roomId,
    firebaseUserId,
  }: {
    id: string;
    name: string;
    userId: string; // PostgreSQL user ID
    roomId: string;
    firebaseUserId: string; // Firebase Auth user ID
  }) => {
    // Check if task already exists in TaskBuffer
    const taskRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/${id}`);
    const snapshot = await get(taskRef);

    if (!snapshot.exists()) {
      // Only add to TaskBuffer if it doesn't exist
      const taskData = {
        id,
        name,
        user_id: userId,
        room_id: roomId,
        status: "in_progress", // Set as in_progress since it's being started
        created_at: Date.now(),
        total_time: 0, // Start with 0, will increment as timer runs
      };

      await set(taskRef, taskData);
      return taskData;
    } else {
      // Task already exists in buffer, just return existing data
      return snapshot.val();
    }
  }
);

// Thunk for creating a task with database persistence (legacy - will be removed)
export const createTaskThunk = createAsyncThunk(
  "tasks/create",
  async ({
    id,
    name,
    userId,
  }: {
    id: string; // UUID generated client-side
    name: string;
    userId: string;
  }) => {
    // Get room ID from the current URL
    const roomId = window.location.pathname.split("/").pop() || "default";

    // Call API to persist to database
    const response = await fetch("/api/task/postgres", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id, // Send the UUID to the server
        task_name: name, // Changed from 'name' to 'task_name'
        user_id: userId,
        room_id: roomId, // Added room_id
        status: "not_started", // Added default status
        duration: 0, // Added default duration
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to create task");
    }

    const data = await response.json();

    return data;
  }
);

// Thunk for deleting a task from database
export const deleteTaskThunk = createAsyncThunk(
  "tasks/delete",
  async ({ id, userId, firebaseUserId }: { id: string; userId: string; firebaseUserId?: string }) => {
    // Call API to delete from database
    const response = await fetch(`/api/task/postgres?id=${id}&user_id=${userId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to delete task");
    }

    // Also delete from Firebase TaskBuffer if firebaseUserId is provided
    if (firebaseUserId) {
      const taskRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/${id}`);
      await remove(taskRef);

      // Check if this was the last task and clean up if needed
      const userTasksRef = ref(rtdb, `TaskBuffer/${firebaseUserId}`);
      const userSnapshot = await get(userTasksRef);

      if (userSnapshot.exists()) {
        const userData = userSnapshot.val();
        const remainingTasks = Object.keys(userData).filter(
          (key) =>
            key !== "timer_state" &&
            key !== "heartbeat" &&
            key !== "tasks" &&
            key !== "rooms" &&
            key !== "completionHistory" &&
            key !== "lastStartSound" &&
            key !== "lastCompleteSound" &&
            key !== "history" &&
            key !== "lastEvent"
        );

        // If no other tasks, remove entire user node
        if (remainingTasks.length === 0) {
          await remove(userTasksRef);
        }
      }
    }

    return id; // Return the task ID that was deleted
  }
);

// Thunk for atomic handoff from TaskBuffer to Postgres
export const transferTaskToPostgres = createAsyncThunk(
  "tasks/transferToPostgres",
  async ({
    taskId,
    firebaseUserId,
    status,
    token,
    duration,
  }: {
    taskId: string;
    firebaseUserId: string;
    status: "completed" | "quit";
    token: string;
    duration?: number; // Optional duration in seconds to override Firebase calculation
  }) => {
    try {
      // 1. Get task data from TaskBuffer
      const taskRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/${taskId}`);
      const snapshot = await get(taskRef);

      if (!snapshot.exists()) {
        // Task not in TaskBuffer - this is expected if it was already completed
        // Return a success response indicating task was already processed
        return {
          success: true,
          alreadyCompleted: true,
          message: "Task already completed and removed from TaskBuffer"
        };
      }

      const taskData = snapshot.val();

      // Calculate final total time including any open segments
      let finalTotalTime = taskData.total_time || 0;
      const timeSegments = taskData.time_segments || [];

      // If there's an open segment, close it and add to total
      if (timeSegments.length > 0 && timeSegments[timeSegments.length - 1].end === null) {
        const lastSegment = timeSegments[timeSegments.length - 1];
        const segmentDuration = Math.floor((Date.now() - lastSegment.start) / 1000);
        finalTotalTime += segmentDuration;
      }

      // Use provided duration if available, otherwise use calculated duration
      const durationToSave = duration !== undefined ? duration : finalTotalTime;

      // 2. Update task in Postgres with completion data
      const patchBody = {
        id: taskData.id,
        updates: {
          status,
          duration: durationToSave,
          updated_at: new Date().toISOString(),
          completed_at: status === "completed" ? new Date().toISOString() : null,
        },
      };

      const response = await fetch("/api/task/postgres", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patchBody),
      });

      if (!response.ok) {
        const errorText = await response.text();

        // Try to parse error details
        let errorMessage = `Failed to update task in Postgres: ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error) {
            errorMessage = errorJson.error;
          }
        } catch {
          // If not JSON, use the text as is
          if (errorText) {
            errorMessage = errorText;
          }
        }

        throw new Error(errorMessage);
      }

      const savedTask = await response.json();

      // 3. On success, only delete the completed task from TaskBuffer

      // Remove the specific task
      await remove(taskRef);

      // Clean up timer state only if it belongs to this task
      const timerRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/timer_state`);
      const timerSnapshot = await get(timerRef);
      if (timerSnapshot.exists()) {
        const timerData = timerSnapshot.val();
        if (timerData.taskId === taskData.id) {
          await remove(timerRef);
        }
      }

      // Clean up heartbeat only if it belongs to this task
      const heartbeatRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/heartbeat`);
      const heartbeatSnapshot = await get(heartbeatRef);
      if (heartbeatSnapshot.exists()) {
        const heartbeatData = heartbeatSnapshot.val();
        if (heartbeatData.taskId === taskData.id) {
          await remove(heartbeatRef);
        }
      }

      // Check if user has any other tasks in TaskBuffer
      const userTasksRef = ref(rtdb, `TaskBuffer/${firebaseUserId}`);
      const userSnapshot = await get(userTasksRef);

      if (userSnapshot.exists()) {
        const userData = userSnapshot.val();
        // Count remaining tasks (excluding timer_state, heartbeat, etc.)
        const remainingTasks = Object.keys(userData).filter(
          (key) =>
            key !== "timer_state" &&
            key !== "heartbeat" &&
            key !== "tasks" &&
            key !== "rooms" &&
            key !== "completionHistory" &&
            key !== "lastStartSound" &&
            key !== "lastCompleteSound" &&
            key !== "history" &&
            key !== "lastEvent"
        );

        // If no other tasks remain, remove the entire user node
        if (remainingTasks.length === 0) {
          await remove(userTasksRef);
        }
      }

      return { savedTask, status };
    } catch (error) {
      // For now, just throw the error without retry
      // TODO: Implement retry logic without circular reference
      throw error;
    }
  }
);

// Thunk for completing a task and saving to task_history
export const completeTaskWithHistory = createAsyncThunk(
  "tasks/completeWithHistory",
  async ({
    taskId,
    roomId,
    userId,
    taskName,
    duration,
    token,
  }: {
    taskId: string;
    roomId: string;
    userId: string;
    taskName: string;
    duration: number; // in seconds
    token: string;
  }) => {
    // Call API to save to task_history
    const response = await fetch("/api/task-history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        task_id: taskId,
        room_id: roomId,
        user_id: userId,
        task_name: taskName,
        duration,
        completed: true,
        completed_at: new Date(),
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to save task history");
    }

    const data = await response.json();
    return data;
  }
);

// Thunk for fetching tasks from TaskBuffer
export const fetchTasksFromBuffer = createAsyncThunk(
  "tasks/fetchFromBuffer",
  async ({ firebaseUserId }: { firebaseUserId: string }) => {
    const userRef = ref(rtdb, `TaskBuffer/${firebaseUserId}`);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
      return [];
    }

    const tasksData = snapshot.val();
    interface FirebaseTaskData {
      id: string;
      name: string;
      status: string;
      total_time?: number;
      time_segments?: Array<{ start: number; end: number | null }>;
      created_at?: number;
      updated_at?: number;
    }

    const tasks = Object.values(tasksData as Record<string, FirebaseTaskData>).map((task) => {
      // Calculate current total time including any open segment
      let currentTotalTime = task.total_time || 0;
      const timeSegments = task.time_segments || [];

      // If there's an open segment, add its duration to the total
      if (timeSegments.length > 0 && timeSegments[timeSegments.length - 1].end === null) {
        const lastSegment = timeSegments[timeSegments.length - 1];
        const segmentDuration = Math.floor((Date.now() - lastSegment.start) / 1000);
        currentTotalTime += segmentDuration;
      }

      return {
        id: task.id,
        name: task.name,
        completed: task.status === "completed",
        timeSpent: currentTotalTime,
        createdAt: task.created_at || Date.now(),
        lastActive: task.updated_at,
        status: task.status as "not_started" | "in_progress" | "paused" | "completed" | "quit",
        order: 0, // Default order for tasks from buffer
      };
    });

    return tasks;
  }
);

// Thunk for checking and restoring active task state
export const checkForActiveTask = createAsyncThunk(
  "tasks/checkForActiveTask",
  async ({ firebaseUserId }: { firebaseUserId: string; userId: string }) => {
    const userRef = ref(rtdb, `TaskBuffer/${firebaseUserId}`);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
      return null;
    }

    const tasksData = snapshot.val();

    // First check if there's a LastTask
    if (tasksData.LastTask) {
      const lastTaskData = tasksData.LastTask;
      const lastTaskId = lastTaskData.taskId;
      
      // Check if this task exists in the TaskBuffer
      if (tasksData[lastTaskId]) {
        const task = tasksData[lastTaskId] as Record<string, unknown>;
        const taskTotalTime = (task.total_time as number) || 0;
        
        
        // Return the LastTask as the active task
        return {
          task: {
            id: lastTaskId,
            name: (task.name as string) || lastTaskData.taskName || "Untitled Task",
            totalTime: taskTotalTime,
            status: "paused" as const,
            timeSegments: [],
          },
          totalTime: taskTotalTime
        };
      }
    }

    // Find any task that's in progress or paused with time accumulated
    let activeTask = null;
    let totalTimeSpent = 0;

    for (const [taskId, taskData] of Object.entries(tasksData)) {
      // Skip non-task entries like LastTask, timer_state, etc.
      if (taskId === 'LastTask' || taskId === 'timer_state' || taskId === 'heartbeat') {
        continue;
      }
      const task = taskData as Record<string, unknown>;

      // Calculate total time including all segments
      let taskTotalTime = (task.total_time as number) || 0;
      const timeSegments = (task.time_segments as Array<{ start: number; end: number | null }>) || [];

      // Check if this task has unclosed segments (was active when window closed)
      const hasOpenSegment = timeSegments.length > 0 && timeSegments[timeSegments.length - 1].end === null;

      // If there's an open segment, close it and add its time
      if (hasOpenSegment) {
        const lastSegment = timeSegments[timeSegments.length - 1];
        const segmentDuration = Math.floor((Date.now() - lastSegment.start) / 1000);
        taskTotalTime += segmentDuration;

        // Close the open segment in Firebase
        timeSegments[timeSegments.length - 1].end = Date.now();
        const taskRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/${taskId}`);
        update(taskRef, {
          time_segments: timeSegments,
          total_time: taskTotalTime,
          status: "paused",
          updated_at: Date.now(),
        });
      }

      // Check if this task has time accumulated (either paused or had open segment)
      if (
        (task.status === "in_progress" || task.status === "paused" || hasOpenSegment) &&
        (taskTotalTime > 0 || hasOpenSegment)
      ) {
        activeTask = {
          id: taskId,
          name: task.name,
          totalTime: taskTotalTime,
          status: "paused", // Always set as paused on restoration
          timeSegments: timeSegments,
        };
        totalTimeSpent = taskTotalTime;
        break;
      }
    }

    return activeTask ? { task: activeTask, totalTime: totalTimeSpent } : null;
  }
);

// Thunk for fetching user's tasks from database
export const fetchTasks = createAsyncThunk("tasks/fetchAll", async ({ userId }: { userId: string }) => {
  const response = await fetch(`/api/task/postgres?user_id=${userId}`);

  if (!response.ok) {
    throw new Error("Failed to fetch tasks");
  }

  const data = await response.json();

  // Transform database tasks to Redux format
  const transformedTasks = data.map(
    (task: {
      id: string;
      task_name: string;
      status: string;
      duration?: number;
      created_at: string;
      updated_at?: string;
      completed_at?: string;
      order: number;
    }) => ({
      id: task.id,
      name: task.task_name, // Changed from task.name to task.task_name
      completed: task.status === "completed",
      timeSpent: task.duration || 0,
      createdAt: new Date(task.created_at).getTime(),
      completedAt: task.completed_at ? new Date(task.completed_at).getTime() : undefined,
      lastActive: task.updated_at ? new Date(task.updated_at).getTime() : undefined,
      status: task.status as "not_started" | "in_progress" | "paused" | "completed" | "quit",
      order: task.order,
    })
  );

  return transformedTasks;
});

// Thunk for recording time segment when starting task (DEPRECATED - kept for compatibility)
export const startTimeSegment = createAsyncThunk(
  "tasks/startTimeSegment",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async ({ taskId, firebaseUserId }: { taskId: string; firebaseUserId: string }) => {
    // This is deprecated - we now use incremental total_time instead of segments
    return { taskId, timeSegments: [] };
  }
);

// Thunk for recording time segment when pausing task (DEPRECATED - kept for compatibility)
export const endTimeSegment = createAsyncThunk(
  "tasks/endTimeSegment",
  async ({ taskId, firebaseUserId }: { taskId: string; firebaseUserId: string }) => {
    // This is deprecated - we now save total_time directly in pause handler
    
    // Get the current total_time from Firebase
    const taskRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/${taskId}`);
    const snapshot = await get(taskRef);
    if (snapshot.exists()) {
      const totalTime = snapshot.val().total_time || 0;
      return { taskId, timeSegments: [], totalTime };
    }
    
    return { taskId, timeSegments: [], totalTime: 0 };
  }
);

// Thunk for updating task status in TaskBuffer (legacy - kept for compatibility)
export const updateTaskStatusInBuffer = createAsyncThunk(
  "tasks/updateStatusInBuffer",
  async ({
    taskId,
    firebaseUserId,
    status,
    totalTime,
  }: {
    taskId: string;
    firebaseUserId: string;
    status: "not_started" | "in_progress" | "paused";
    totalTime?: number;
  }) => {
    const taskRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/${taskId}`);

    const updates: Record<string, unknown> = {
      status,
      updated_at: Date.now(),
    };

    if (totalTime !== undefined) {
      updates.total_time = totalTime;
    }

    await update(taskRef, updates);

    return { taskId, status, totalTime };
  }
);

// Thunk for updating task status with persistence
export const updateTaskStatusThunk = createAsyncThunk(
  "tasks/updateStatus",
  async ({
    taskId,
    status,
    token,
  }: {
    taskId: string;
    status: "not_started" | "in_progress" | "paused" | "completed" | "quit";
    token: string;
  }) => {
    // Database status matches our frontend status directly now
    const dbStatus = status;

    // Call API to update status in database
    const response = await fetch("/api/task/status", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        task_id: taskId,
        status: dbStatus,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to update task status");
    }

    const data = await response.json();

    return {
      taskId,
      status,
      dbStatus: data.status,
      updatedAt: data.updated_at,
    };
  }
);

// Thunk for cleaning up TaskBuffer when quitting (without transferring to Postgres)
export const cleanupTaskFromBuffer = createAsyncThunk(
  "tasks/cleanupFromBuffer",
  async ({ taskId, firebaseUserId }: { taskId: string; firebaseUserId: string }) => {
    
    // Remove task from TaskBuffer if it exists
    const taskRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/${taskId}`);

    // Check if task exists before trying to remove
    const snapshot = await get(taskRef);
    if (snapshot.exists()) {
      
      try {
        await remove(taskRef);
        
        // Wait a moment for any concurrent operations
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify it was actually removed
        const verifySnapshot = await get(taskRef);
        if (verifySnapshot.exists()) {
          // Try removing again - this handles race conditions
          await remove(taskRef);
          
          // Final verification
          await new Promise(resolve => setTimeout(resolve, 100));
          const finalSnapshot = await get(taskRef);
          if (finalSnapshot.exists()) {
          } else {
          }
        } else {
        }
      } catch (error) {
        console.error('[cleanupTaskFromBuffer] Error during removal:', error);
      }
    } else {
    }

    // Also clear any timer state if it exists
    const timerRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/timer_state`);
    const timerSnapshot = await get(timerRef);
    if (timerSnapshot.exists()) {
      const timerData = timerSnapshot.val();
      // Only remove if it's for this task
      if (timerData.taskId === taskId) {
        await remove(timerRef);
      }
    }

    // Clear heartbeat if it exists and matches this task
    const heartbeatRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/heartbeat`);
    const heartbeatSnapshot = await get(heartbeatRef);
    if (heartbeatSnapshot.exists()) {
      const heartbeatData = heartbeatSnapshot.val();
      if (heartbeatData.taskId === taskId) {
        await remove(heartbeatRef);
      }
    }

    // IMPORTANT: Also remove LastTask if it matches the quit task
    const lastTaskRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/LastTask`);
    const lastTaskSnapshot = await get(lastTaskRef);
    if (lastTaskSnapshot.exists()) {
      const lastTaskData = lastTaskSnapshot.val();
      if (lastTaskData.taskId === taskId) {
        await remove(lastTaskRef);
      }
    }

    return { taskId };
  }
);

// Thunk for updating task order in database
export const updateTaskOrder = createAsyncThunk(
  "tasks/updateOrder",
  async ({ updates, token }: { updates: Array<{ taskId: string; order: number }>; token: string }) => {
    const response = await fetch("/api/task/reorder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ updates }),
    });

    if (!response.ok) {
      throw new Error("Failed to update task order");
    }

    const data = await response.json();
    return { updates, ...data };
  }
);

const taskSlice = createSlice({
  name: "tasks",
  initialState,
  reducers: {
    // Add task to Redux store (optimistic)
    addTask: (state, action: PayloadAction<{ id: string; name: string }>) => {
      // Calculate the highest order number to place new task at the end
      const maxOrder = state.tasks.reduce((max, task) => Math.max(max, task.order), -1);
      
      const newTask: Task = {
        id: action.payload.id,
        name: action.payload.name,
        completed: false,
        timeSpent: 0,
        createdAt: Date.now(),
        status: "not_started",
        isOptimistic: true,
        order: maxOrder + 1, // New tasks go to the bottom
      };
      state.tasks.push(newTask);
    },
    // Mark task as synced with database
    markTaskSynced: (state, action: PayloadAction<string>) => {
      const task = state.tasks.find((task) => task.id === action.payload);
      if (task) {
        task.isOptimistic = false;
      }
    },
    updateTask: (state, action: PayloadAction<{ id: string; updates: Partial<Task> }>) => {
      const taskIndex = state.tasks.findIndex((task) => task.id === action.payload.id);
      if (taskIndex !== -1) {
        state.tasks[taskIndex] = { ...state.tasks[taskIndex], ...action.payload.updates };
      }
    },
    deleteTask: (state, action: PayloadAction<string>) => {
      state.tasks = state.tasks.filter((task) => task.id !== action.payload);
    },
    setActiveTask: (state, action: PayloadAction<string | null>) => {
      state.activeTaskId = action.payload;
    },
    toggleTaskComplete: (state, action: PayloadAction<string>) => {
      const task = state.tasks.find((task) => task.id === action.payload);
      if (task) {
        task.completed = !task.completed;
        task.status = task.completed ? "completed" : "not_started";
      }
    },
    updateTaskTime: (state, action: PayloadAction<{ id: string; timeSpent: number }>) => {
      const task = state.tasks.find((task) => task.id === action.payload.id);
      if (task) {
        task.timeSpent = action.payload.timeSpent;
        task.lastActive = Date.now();
        if (task.status === "not_started" && action.payload.timeSpent > 0) {
          task.status = "in_progress";
        }
      }
    },
    reorderTasks: (state, action: PayloadAction<Task[]>) => {
      // Update tasks with new order values
      state.tasks = action.payload.map((task, index) => ({
        ...task,
        order: index,
      }));
    },
    removeOptimisticTask: (state, action: PayloadAction<string>) => {
      // Remove optimistic task if API call fails
      state.tasks = state.tasks.filter((task) => task.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    // Handle addTaskToBufferWhenStarted
    builder
      .addCase(addTaskToBufferWhenStarted.pending, () => {
        // Task is being added to buffer
      })
      .addCase(addTaskToBufferWhenStarted.fulfilled, (state, action) => {
        // Task successfully added to buffer when started
        const taskId = action.meta.arg.id;
        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          task.status = "in_progress";
          task.lastActive = Date.now();
        }
      })
      .addCase(addTaskToBufferWhenStarted.rejected, (state, action) => {
        state.error = action.error.message || "Failed to add task to buffer";
      })
      // Handle fetchTasksFromBuffer
      .addCase(fetchTasksFromBuffer.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTasksFromBuffer.fulfilled, (state, action) => {
        state.loading = false;
        state.tasks = action.payload;
      })
      .addCase(fetchTasksFromBuffer.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch tasks from buffer";
      })
      // Handle transferTaskToPostgres
      .addCase(transferTaskToPostgres.pending, () => {
        // Task is being transferred
      })
      .addCase(transferTaskToPostgres.fulfilled, (state, action) => {
        // Check if task was already completed
        if (action.payload.alreadyCompleted) {
          // Task was already processed, no state updates needed
          return;
        }
        
        // Update task in local state with completion data
        const { savedTask, status } = action.payload;
        
        // Only update if we have a status (not alreadyCompleted case)
        if (!status) return;
        
        // Use the original task ID from the action arguments, not the returned savedTask.id
        const originalTaskId = action.meta.arg.taskId;
        const taskIndex = state.tasks.findIndex((task) => task.id === originalTaskId);

        if (taskIndex !== -1) {
          // Update the existing task with completion data
          state.tasks[taskIndex] = {
            ...state.tasks[taskIndex],
            status: status,
            completed: status === "completed",
            completedAt: status === "completed" ? Date.now() : undefined,
            timeSpent: savedTask?.duration || state.tasks[taskIndex].timeSpent,
            lastActive: Date.now(),
          };
        }

        // Clear activeTaskId if the completed task was the active one
        // Use the original task ID, not the potentially new savedTask.id
        if (state.activeTaskId === originalTaskId) {
          state.activeTaskId = null;
        }
      })
      .addCase(transferTaskToPostgres.rejected, (state, action) => {
        state.error = action.error.message || "Failed to transfer task to Postgres";
      })
      // Handle updateTaskStatusInBuffer
      .addCase(updateTaskStatusInBuffer.pending, (state, action) => {
        // Optimistically update the task status
        const { taskId, status } = action.meta.arg;
        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          task.status = status;
          task.completed = false; // This thunk doesn't handle completed status
          task.lastActive = Date.now();
        }
      })
      .addCase(updateTaskStatusInBuffer.fulfilled, (state) => {
        // Status already updated optimistically
        state.error = null;
      })
      .addCase(updateTaskStatusInBuffer.rejected, (state, action) => {
        state.error = action.error.message || "Failed to update task status in buffer";
      })
      // Handle startTimeSegment
      .addCase(startTimeSegment.pending, (state, action) => {
        const { taskId } = action.meta.arg;
        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          task.status = "in_progress";
          task.lastActive = Date.now();
        }
      })
      .addCase(startTimeSegment.fulfilled, (state) => {
        state.error = null;
      })
      .addCase(startTimeSegment.rejected, (state, action) => {
        state.error = action.error.message || "Failed to start time segment";
      })
      // Handle endTimeSegment
      .addCase(endTimeSegment.pending, (state, action) => {
        const { taskId } = action.meta.arg;
        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          task.status = "paused";
          task.lastActive = Date.now();
        }
      })
      .addCase(endTimeSegment.fulfilled, (state, action) => {
        const { taskId, totalTime } = action.payload;
        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          task.timeSpent = totalTime;
        }
        state.error = null;
      })
      .addCase(endTimeSegment.rejected, (state, action) => {
        state.error = action.error.message || "Failed to end time segment";
      })
      // Handle cleanupTaskFromBuffer (for quit)
      .addCase(cleanupTaskFromBuffer.fulfilled, (state, action) => {
        const { taskId } = action.payload;
        // Reset the quit task to virgin state
        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          task.status = "not_started";
          task.timeSpent = 0;  // Reset time to 0 for quit task
          task.lastActive = undefined;
          // Keep the original creation time
        }
        // Clear activeTaskId if this was the active task
        if (state.activeTaskId === taskId) {
          state.activeTaskId = null;
        }
      });
    // Handle createTaskThunk (legacy)
    builder
      .addCase(createTaskThunk.pending, () => {
        // Optimistic update is already done via addTask
      })
      .addCase(createTaskThunk.fulfilled, (state, action) => {
        // Mark task as synced
        const taskId = action.meta.arg.id;
        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          task.isOptimistic = false;
        }
      })
      .addCase(createTaskThunk.rejected, (state, action) => {
        // Remove the optimistic task on failure
        const taskId = action.meta.arg.id;
        state.tasks = state.tasks.filter((task) => task.id !== taskId);
        state.error = action.error.message || "Failed to create task";
      })
      // Handle deleteTaskThunk
      .addCase(deleteTaskThunk.pending, () => {
        // Task deletion is in progress
      })
      .addCase(deleteTaskThunk.fulfilled, (state, action) => {
        // Remove task from state after successful deletion
        state.tasks = state.tasks.filter((task) => task.id !== action.payload);
        state.error = null;
      })
      .addCase(deleteTaskThunk.rejected, (state, action) => {
        state.error = action.error.message || "Failed to delete task";
      })
      // Handle fetchTasks
      .addCase(fetchTasks.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTasks.fulfilled, (state, action) => {
        state.loading = false;
        // Sort tasks by order (ascending, with -1 values first)
        state.tasks = action.payload.sort((a: Task, b: Task) => a.order - b.order);
      })
      .addCase(fetchTasks.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch tasks";
      })
      // Handle checkForActiveTask
      .addCase(checkForActiveTask.pending, () => {
        // Checking for active task
      })
      .addCase(checkForActiveTask.fulfilled, (state, action) => {
        if (action.payload) {
          const { task } = action.payload;
          // Set the active task
          state.activeTaskId = task.id;

          // Update the task in the tasks array
          const existingTask = state.tasks.find((t) => t.id === task.id);
          if (existingTask) {
            existingTask.status = task.status as "not_started" | "in_progress" | "paused" | "completed" | "quit";
            existingTask.timeSpent = task.totalTime;
            existingTask.lastActive = Date.now();
          }
        }
      })
      .addCase(checkForActiveTask.rejected, () => {
        // Silently fail - not critical if we can't restore active task
      })
      // Handle updateTaskStatusThunk
      .addCase(updateTaskStatusThunk.pending, (state, action) => {
        // Optimistically update the task status
        const { taskId, status } = action.meta.arg;
        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          // Update status and completed flag
          task.status = status;
          task.completed = status === "completed";
          task.lastActive = Date.now();
        }
      })
      .addCase(updateTaskStatusThunk.fulfilled, (state) => {
        // Status already updated optimistically, just clear any errors
        state.error = null;
      })
      .addCase(updateTaskStatusThunk.rejected, (state, action) => {
        // Revert optimistic update on failure
        state.error = action.error.message || "Failed to update task status";
        // Could implement rollback logic here if needed
      })
      // Handle updateTaskOrder
      .addCase(updateTaskOrder.pending, () => {
        // Order update in progress
      })
      .addCase(updateTaskOrder.fulfilled, (state) => {
        // Order already updated optimistically via reorderTasks
        state.error = null;
      })
      .addCase(updateTaskOrder.rejected, (state, action) => {
        state.error = action.error.message || "Failed to update task order";
      });
  },
  // extraReducers: (builder) => {
  //   builder
  //     .addCase(createTask.pending, (state) => {
  //       state.loading = true;
  //       state.error = null;
  //     })
  //     .addCase(createTask.fulfilled, (state, action) => {
  //       state.loading = false;
  //       // Find and replace the optimistic task with real one from database
  //       const taskIndex = state.tasks.findIndex((task) =>
  //         task.id.startsWith("temp_") && task.name === action.meta.arg.name
  //       );
  //       if (taskIndex !== -1) {
  //         state.tasks[taskIndex] = action.payload;
  //       } else {
  //         // If optimistic task wasn't found, just add the new one
  //         state.tasks.push(action.payload);
  //       }
  //     })
  //     .addCase(createTask.rejected, (state, action) => {
  //       state.loading = false;
  //       state.error = action.error.message || "Failed to create task";
  //       // Remove optimistic task on failure
  //       state.tasks = state.tasks.filter((task) =>
  //         !(task.id.startsWith("temp_") && task.name === action.meta.arg.name)
  //       );
  //     });
  // },
});

export const {
  addTask,
  markTaskSynced,
  updateTask,
  deleteTask,
  setActiveTask,
  toggleTaskComplete,
  updateTaskTime,
  reorderTasks,
  removeOptimisticTask,
} = taskSlice.actions;

export default taskSlice.reducer;
