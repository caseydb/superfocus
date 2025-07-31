import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store/store";
import { useInstance } from "../Components/Instances";
import { rtdb } from "../../lib/firebase";
import { ref, remove, update, onDisconnect, get, set } from "firebase/database";
import { updateTask } from "../store/taskSlice";

interface PauseButtonOptions {
  task: string;
  seconds: number;
  saveTimerState: (isRunning: boolean, baseSeconds?: number) => void;
  setRunning: (running: boolean) => void;
  setIsStarting: (starting: boolean) => void;
  heartbeatIntervalRef?: React.MutableRefObject<NodeJS.Timeout | null>;
}

export function usePauseButton() {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useInstance();
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);
  const { currentTaskId } = useSelector((state: RootState) => state.taskInput);

  const handleStop = useCallback(
    async (options: PauseButtonOptions) => {
      const { seconds, saveTimerState, setRunning, setIsStarting, heartbeatIntervalRef } = options;

      // Use activeTaskId or currentTaskId instead of finding by name
      const taskId = activeTaskId || currentTaskId;
      console.log('[PauseButton] Pausing task:', taskId, 'with seconds:', seconds);
      
      if (taskId) {
        dispatch(
          updateTask({
            id: taskId,
            updates: { status: "paused" as const },
          })
        );

        // Simply save the current total time to TaskBuffer
        if (user?.id) {
          const taskRef = ref(rtdb, `TaskBuffer/${user.id}/${taskId}`);
          console.log('[PauseButton] Saving total_time:', seconds, 'for task:', taskId);
          
          // Check if task still exists before updating (might have been quit)
          const checkSnapshot = await get(taskRef);
          if (!checkSnapshot.exists()) {
            console.log('[PauseButton] Task no longer exists in TaskBuffer, skipping save');
            return;
          }
          
          // Get the task name for LastTask
          const taskSnapshot = await get(taskRef);
          const taskData = taskSnapshot.exists() ? taskSnapshot.val() : null;
          const taskName = taskData?.name || options.task || "Untitled Task";
          
          // Update LastTask to ensure it's the most recent
          const lastTaskRef = ref(rtdb, `TaskBuffer/${user.id}/LastTask`);
          await set(lastTaskRef, {
            taskId: taskId,
            taskName: taskName,
            timestamp: Date.now()
          });
          
          // Update the task's total_time in Firebase
          update(taskRef, {
            total_time: seconds,
            status: "paused",
            updated_at: Date.now()
          }).then(() => {
            console.log('[PauseButton] Successfully saved total_time to Firebase');
            // Save timer state
            saveTimerState(false, seconds);
            
            // Update Redux
            dispatch(updateTask({
              id: taskId,
              updates: { 
                timeSpent: seconds,
                status: "paused" as const
              }
            }));
          }).catch((error) => {
            console.log('[PauseButton] Failed to update task - it may have been deleted:', error);
          });

          // Update heartbeat to show timer is paused
          const heartbeatRef = ref(rtdb, `TaskBuffer/${user.id}/heartbeat`);
          update(heartbeatRef, {
            is_running: false,
            last_seen: Date.now(),
          });

          // Remove ActiveWorker when pausing
          const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
          remove(activeWorkerRef);
          onDisconnect(activeWorkerRef).cancel();
        } else {
          // If no user, just save current seconds
          saveTimerState(false, seconds);
        }
      }

      // Clear heartbeat interval
      if (heartbeatIntervalRef?.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      // Set state AFTER all operations
      setRunning(false);
      setIsStarting(false);
    },
    [dispatch, user, activeTaskId, currentTaskId]
  );

  return { handleStop };
}