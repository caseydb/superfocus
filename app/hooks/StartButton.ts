import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store/store";
import { useInstance } from "../Components/Instances";
import { rtdb } from "../../lib/firebase";
import { ref, set, onDisconnect, update } from "firebase/database";
import { v4 as uuidv4 } from "uuid";
import {
  updateTask,
  startTimeSegment,
  addTaskToBufferWhenStarted,
  addTask,
  createTaskThunk,
  setActiveTask,
  reorderTasks,
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
}

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export function useStartButton() {
  const dispatch = useDispatch<AppDispatch>();
  const { user, currentInstance } = useInstance();
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const reduxUser = useSelector((state: RootState) => state.user);

  const moveTaskToTop = useCallback(
    async (task: string): Promise<void> => {
      if (!task?.trim()) return;

      const taskName = task.trim();
      const currentTaskIndex = reduxTasks.findIndex((t) => t.name === taskName);

      if (currentTaskIndex > 0) {
        const reorderedTasks = [...reduxTasks];
        const [taskToMove] = reorderedTasks.splice(currentTaskIndex, 1);
        const updatedTask = { ...taskToMove, order: -1 };
        reorderedTasks.unshift(updatedTask);
        dispatch(reorderTasks(reorderedTasks));
      }
      return Promise.resolve();
    },
    [reduxTasks, dispatch]
  );

  const notifyEvent = useCallback(
    (type: "start") => {
      if (currentInstance && user?.id) {
        const eventId = `${user.id}-${type}-${Date.now()}`;
        const eventRef = ref(rtdb, `GlobalEffects/${currentInstance.id}/events/${eventId}`);
        const eventData = {
          displayName: user.displayName,
          userId: user.id,
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
    [currentInstance, user]
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
      } = options;

      setIsStarting(true);

      // Move task to position #1 in task list BEFORE starting timer (only for new starts)
      if (!isResume && task && task.trim() && user?.id) {
        await moveTaskToTop(task);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Handle task creation/selection based on whether we're resuming or starting new
      let taskId = "";
      
      if (isResume) {
        // If resuming, find the currently active/paused task
        const activeTask = reduxTasks.find((t) => 
          t.name === task?.trim() && 
          (t.status === "in_progress" || t.status === "paused")
        );
        
        if (activeTask) {
          taskId = activeTask.id;
          console.log('[StartButton] Resuming existing active task:', {
            taskId: activeTask.id,
            taskName: task.trim(),
            status: activeTask.status
          });
          dispatch(setActiveTask(activeTask.id));
        } else {
          console.log('[StartButton] No active task found to resume');
        }
      } else {
        // If not resuming (starting fresh), check if there's an existing not_started task with same name
        if (task?.trim() && user?.id && currentInstance && reduxUser.user_id) {
          // First check if there's already a task with this name that was cleared (not_started)
          const existingTask = reduxTasks.find((t) => 
            t.name === task.trim() && 
            t.status === "not_started"
          );
          
          if (existingTask) {
            // Reuse the existing task ID
            taskId = existingTask.id;
            console.log('[StartButton] Reusing existing not_started task:', {
              taskId: existingTask.id,
              taskName: task.trim()
            });
            dispatch(setActiveTask(existingTask.id));
          } else {
            // Create a new task only if no existing task found
            taskId = uuidv4();
            console.log('[StartButton] Creating new task:', {
              taskId,
              taskName: task.trim()
            });

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

        // Then start the time segment
        await dispatch(
          startTimeSegment({
            taskId,
            firebaseUserId: user.id,
          })
        ).unwrap();
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

        // Create ActiveWorker entry
        if (currentInstance) {
          const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
          const now = Date.now();
          const activeWorkerData = {
            userId: user.id,
            roomId: currentInstance.id,
            taskId,
            isActive: true,
            lastSeen: now,
            displayName: user.displayName || "Anonymous",
          };
          set(activeWorkerRef, activeWorkerData);

          // Set up onDisconnect to remove ActiveWorker if user disconnects
          onDisconnect(activeWorkerRef).remove();
        }

        // Start heartbeat interval
        if (heartbeatIntervalRef?.current) {
          clearInterval(heartbeatIntervalRef.current);
        }

        if (heartbeatIntervalRef) {
          heartbeatIntervalRef.current = setInterval(() => {
            const now = Date.now();

            // Update both heartbeat and ActiveWorker with error handling
            Promise.all([
              update(heartbeatRef, { last_seen: now }).catch(() => {
                // Ignore heartbeat update errors
              }),
              currentInstance
                ? update(ref(rtdb, `ActiveWorker/${user.id}`), { lastSeen: now }).catch(() => {
                    // Try to recreate the ActiveWorker entry if update failed
                    const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
                    set(activeWorkerRef, {
                      userId: user.id,
                      roomId: currentInstance.id,
                      taskId,
                      isActive: true,
                      lastSeen: now,
                      displayName: user.displayName || "Anonymous",
                    }).catch(() => {});
                  })
                : Promise.resolve(),
            ]);
          }, 5000); // Update every 5 seconds for better reliability
        }
      }

      // Set running state AFTER all async operations
      setRunning(true);
      setIsStarting(false);

      // Small delay to ensure state is set before Firebase save
      setTimeout(() => {
        saveTimerState(true, seconds);
      }, 50);

      // Only play start sound and notify if this is an initial start (not a resume)
      if (!isResume) {
        // Always play start sound locally
        const startAudio = new Audio("/started.mp3");
        startAudio.volume = localVolume;
        startAudio.play();

        // Notify parent that a new task is starting
        if (onNewTaskStart) {
          onNewTaskStart();
        }

        // Check cooldown using prop value
        const now = Date.now();
        const timeSinceLastStart = lastStartTime > 0 ? now - lastStartTime : COOLDOWN_MS;

        // Only send start event to RTDB if cooldown has passed
        if (timeSinceLastStart >= COOLDOWN_MS) {
          notifyEvent("start");
        }
      }
    },
    [dispatch, user, currentInstance, reduxTasks, reduxUser, moveTaskToTop, notifyEvent]
  );

  return { handleStart };
}