import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store/store";
import { useInstance } from "../Components/Instances";
import { rtdb } from "../../lib/firebase";
import { ref, update, get, set } from "firebase/database";
import { PresenceService } from "../utils/presenceService";
import { updateTask, saveToCache } from "../store/taskSlice";

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
  const { user, currentInstance } = useInstance();
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);
  const { currentTaskId } = useSelector((state: RootState) => state.taskInput);
  const reduxUser = useSelector((state: RootState) => state.user);

  const handleStop = useCallback(
    async (options: PauseButtonOptions) => {
      const { seconds, saveTimerState, setRunning, setIsStarting, heartbeatIntervalRef } = options;

// Use activeTaskId or currentTaskId instead of finding by name
      const taskId = activeTaskId || currentTaskId;
      
      if (taskId) {
        dispatch(
          updateTask({
            id: taskId,
            updates: { status: "paused" as const },
          })
        );

        // Save the current total time
        if (user?.id && !reduxUser.isGuest) {
          const taskRef = ref(rtdb, `TaskBuffer/${user.id}/${taskId}`);
          
          // Check if task still exists before updating (might have been quit)
          const checkSnapshot = await get(taskRef);
          if (!checkSnapshot.exists()) {
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
            // Persist local cache for guests
            if (reduxUser.isGuest) {
              dispatch(saveToCache());
            }
          }).catch(() => {
            // Error handled silently - task may have been deleted
          });

          // Update heartbeat to show timer is paused
          const heartbeatRef = ref(rtdb, `TaskBuffer/${user.id}/heartbeat`);
          update(heartbeatRef, {
            is_running: false,
            last_seen: Date.now(),
          });

          // Presence update moved below to run for all users
        } else {
          // If no user, just save current seconds
          saveTimerState(false, seconds);
          // Update Redux for guests
          if (taskId) {
            dispatch(updateTask({
              id: taskId,
              updates: {
                timeSpent: seconds,
                status: "paused" as const
              }
            }));
            dispatch(saveToCache());
          }
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

      // Update presence to inactive (all users)
      if (currentInstance && user?.id) {
        PresenceService.updateUserPresence(user.id, currentInstance.id, false);
      }
    },
    [dispatch, user, activeTaskId, currentTaskId, currentInstance]
  );

  return { handleStop };
}
