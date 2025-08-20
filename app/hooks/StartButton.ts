import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store/store";
import { useInstance } from "../Components/Instances";
import { rtdb } from "../../lib/firebase";
import { ref, set, update, remove, get } from "firebase/database";
import { PresenceService } from "../utils/presenceService";
import { v4 as uuidv4 } from "uuid";
import { playAudio } from "../utils/activeAudio";
import { updateUserActivity } from "../utils/updateUserActivity";
import {
  updateTask,
  addTaskToBufferWhenStarted,
  addTask,
  createTaskThunk,
  setActiveTask,
  reorderTasks,
  updateTaskOrder,
} from "../store/taskSlice";

interface StartButtonOptions {
  task: string;
  seconds: number;
  isResume: boolean;
  localVolume: number;
  onNewTaskStart?: () => void;
  lastStartTime?: number;
  saveTimerState: (isRunning: boolean, baseSeconds?: number) => void;
  setRunning: (running: boolean) => void;
  setIsStarting: (starting: boolean) => void;
  timerStartRef?: React.RefObject<() => void>;
  heartbeatIntervalRef?: React.MutableRefObject<NodeJS.Timeout | null>;
  pauseTimer?: () => void;
  running?: boolean;
}

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export function useStartButton() {
  const dispatch = useDispatch<AppDispatch>();
  const { user, currentInstance } = useInstance();
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const reduxUser = useSelector((state: RootState) => state.user);
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);
  // const { currentTaskId } = useSelector((state: RootState) => state.taskInput);

  const moveTaskToTop = useCallback(
    async (task: string): Promise<void> => {
      if (!task?.trim()) return;

      const taskName = task.trim();
      const currentTaskIndex = reduxTasks.findIndex((t) => t.name === taskName);

      if (currentTaskIndex > 0) {
        // Move task to top of array
        const reorderedTasks = [...reduxTasks];
        const [taskToMove] = reorderedTasks.splice(currentTaskIndex, 1);
        reorderedTasks.unshift(taskToMove);
        // The reorderTasks reducer will handle setting proper order values
        dispatch(reorderTasks(reorderedTasks));
        
        // Update database with new order
        const token = localStorage.getItem("firebase_token") || "";
        const updates = reorderedTasks.map((task, index) => ({
          taskId: task.id,
          order: index
        }));
        dispatch(updateTaskOrder({ updates, token }));
      }
      return Promise.resolve();
    },
    [reduxTasks, dispatch]
  );

  const notifyEvent = useCallback(
    async (type: "start") => {
      if (currentInstance && user?.id) {
        // Use Redux user data which is already loaded and accurate
        const firstName = reduxUser?.first_name || "";
        const lastName = reduxUser?.last_name || "";
        
        const eventId = `${user.id}-${type}-${Date.now()}`;
        const eventRef = ref(rtdb, `GlobalEffects/${currentInstance.id}/events/${eventId}`);
        const eventData = {
          displayName: user.displayName, // Keep for backward compatibility
          firstName,
          lastName,
          userId: user.id,
          authId: reduxUser?.auth_id, // Add auth ID to event data
          type,
          timestamp: Date.now(),
        };

        set(eventRef, eventData);

        // Auto-cleanup old events after 10 seconds
        setTimeout(() => {
          const eventRef = ref(rtdb, `GlobalEffects/${currentInstance.id}/events/${eventId}`);
          import("firebase/database").then(({ remove }) => {
            remove(eventRef);
          });
        }, 10000);
      }
    },
    [currentInstance, user, reduxUser]
  );

  const handleStart = useCallback(
    async (options: StartButtonOptions) => {
      const {
        task,
        seconds,
        isResume,
        localVolume,
        onNewTaskStart,
        lastStartTime = 0,
        saveTimerState,
        setRunning,
        setIsStarting,
        heartbeatIntervalRef,
        pauseTimer,
        running,
      } = options;

      setIsStarting(true);


      // First, determine what task ID we're about to start
      let taskIdToStart = "";
      
      if (isResume) {
        // If resuming, find the currently active/paused task
        const activeTask = reduxTasks.find((t) => 
          t.name === task?.trim() && 
          (t.status === "in_progress" || t.status === "paused")
        );
        
        if (activeTask) {
          taskIdToStart = activeTask.id;
        }
      } else {
        // If not resuming (starting fresh)
        if (task?.trim()) {
          // First check if there's an activeTaskId set (from dropdown selection)
          if (activeTaskId) {
            const activeTask = reduxTasks.find((t) => t.id === activeTaskId);
            if (activeTask && activeTask.name === task.trim()) {
              taskIdToStart = activeTaskId;
            }
          }
          
          // If no activeTaskId or it doesn't match, check if there's already a task with this name
          if (!taskIdToStart) {
            const existingTask = reduxTasks.find((t) => 
              t.name === task.trim() && 
              t.status === "not_started"
            );
            
            if (existingTask) {
              taskIdToStart = existingTask.id;
            } else {
              // Will create a new task
              taskIdToStart = uuidv4();
            }
          }
        }
      }

      // Check if there's another task currently running
      
      if (!isResume && taskIdToStart && running && activeTaskId && activeTaskId !== taskIdToStart) {
        
        // Call the pause function to properly pause the current task
        if (pauseTimer) {
          pauseTimer();
          // Wait for pause to complete
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
        }
      }

      // Move task to position #1 in task list BEFORE starting timer (only for new starts)
      if (!isResume && task && task.trim() && user?.id) {
        await moveTaskToTop(task);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Use the task ID we determined above
      const taskId = taskIdToStart;
      
      // Set the active task
      if (taskId) {
        dispatch(setActiveTask(taskId));
      }
      
      // Create new task if needed (only when not resuming and no existing task was found)
      if (!isResume && task?.trim() && user?.id && currentInstance && reduxUser.user_id) {
        if (taskId === taskIdToStart && !reduxTasks.find(t => t.id === taskId)) {
          // This is a new task that needs to be created
          
          // Add optimistic task immediately
          dispatch(
            addTask({
              id: taskId,
              name: task.trim(),
            })
          );

          // Persist to PostgreSQL database
          dispatch(
            createTaskThunk({
              id: taskId,
              name: task.trim(),
              userId: reduxUser.user_id,
            })
          );

          // Set the new task as active
          dispatch(setActiveTask(taskId));
        }
      }

      // Optimistically update task status to in_progress
      if (taskId) {
        dispatch(
          updateTask({
            id: taskId,
            updates: { status: "in_progress" as const },
          })
        );
      }

      // Add task to TaskBuffer first, then start a new time segment
      if (taskId && user?.id && currentInstance) {
        // First, ensure task exists in TaskBuffer
        await dispatch(
          addTaskToBufferWhenStarted({
            id: taskId,
            name: task!.trim(),
            userId: reduxUser.user_id!,
            roomId: currentInstance.id,
            firebaseUserId: user.id,
          })
        ).unwrap();

        // No need for time segments anymore, just update status
      }

      // Write heartbeat to Firebase
      if (user?.id) {
        const heartbeatRef = ref(rtdb, `TaskBuffer/${user.id}/heartbeat`);

        const heartbeatData = {
          taskId,
          start_time: Date.now(),
          last_seen: Date.now(),
          is_running: true,
        };

        set(heartbeatRef, heartbeatData);

        // Update presence to active with task info
        if (currentInstance) {
          PresenceService.updateUserPresence(user.id, currentInstance.id, true, {
            taskId,
            taskName: task?.trim() || "Untitled Task"
          });
        }

        // Start heartbeat interval
        if (heartbeatIntervalRef?.current) {
          clearInterval(heartbeatIntervalRef.current);
        }

        if (heartbeatIntervalRef) {
          heartbeatIntervalRef.current = setInterval(async () => {
            // Check if heartbeat still exists before updating
            const heartbeatSnapshot = await get(heartbeatRef);
            if (!heartbeatSnapshot.exists()) {
              // Heartbeat was removed, stop the interval
              if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
                heartbeatIntervalRef.current = null;
              }
              return;
            }
            
            const now = Date.now();

            // Update heartbeat with error handling
            update(heartbeatRef, { last_seen: now }).catch(() => {
              // Ignore heartbeat update errors
            });
          }, 300000); // Update every 5 minutes to reduce Firebase writes
        }
      }

      // Set running state AFTER all async operations
      setRunning(true);
      setIsStarting(false);

      // Save this as the last active task
      if (taskId && user?.id) {
        const lastTaskRef = ref(rtdb, `TaskBuffer/${user.id}/LastTask`);
        set(lastTaskRef, {
          taskId: taskId,
          taskName: task?.trim() || "",
          timestamp: Date.now()
        });

        // Clear the justCompletedTask flag when starting a new task
        const completedFlagRef = ref(rtdb, `TaskBuffer/${user.id}/justCompletedTask`);
        remove(completedFlagRef);
      }

      // Small delay to ensure state is set before Firebase save
      setTimeout(() => {
        // Always use the current seconds (which should be the task's total_time)
        saveTimerState(true, seconds);
      }, 50);

      // Play start sound and notify for both start and resume
      // Always play start sound locally (for both start and resume)
      playAudio("/started.mp3", localVolume);

      // Notify parent that a task is starting/resuming
      if (onNewTaskStart) {
        onNewTaskStart();
      }

      // Check cooldown using prop value (applies to both start and resume)
      const now = Date.now();
      const timeSinceLastStart = lastStartTime > 0 ? now - lastStartTime : COOLDOWN_MS;

      // Only send start event to RTDB if cooldown has passed (for both start and resume)
      if (timeSinceLastStart >= COOLDOWN_MS) {
        notifyEvent("start");
      }

      // Update user's last_active timestamp
      updateUserActivity();
    },
    [dispatch, user, currentInstance, reduxTasks, reduxUser, activeTaskId, moveTaskToTop, notifyEvent]
  );

  return { handleStart };
}