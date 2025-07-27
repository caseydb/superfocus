import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store/store";
import { useInstance } from "../Components/Instances";
import { rtdb } from "../../lib/firebase";
import { ref, remove, update, onDisconnect } from "firebase/database";
import { updateTask, endTimeSegment } from "../store/taskSlice";

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
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);

  const handleStop = useCallback(
    (options: PauseButtonOptions) => {
      const { task, seconds, saveTimerState, setRunning, setIsStarting, heartbeatIntervalRef } = options;

      // Optimistically update task status to paused
      const activeTask = reduxTasks.find((t) => t.name === task?.trim());
      if (activeTask?.id) {
        dispatch(
          updateTask({
            id: activeTask.id,
            updates: { status: "paused" as const },
          })
        );

        // End the current time segment in TaskBuffer
        if (user?.id) {
          dispatch(
            endTimeSegment({
              taskId: activeTask.id,
              firebaseUserId: user.id,
            })
          );
        }

        // Update heartbeat to show timer is paused
        if (user?.id) {
          const heartbeatRef = ref(rtdb, `TaskBuffer/${user.id}/heartbeat`);
          update(heartbeatRef, {
            is_running: false,
            last_seen: Date.now(),
          });

          // Remove ActiveWorker when pausing
          const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
          remove(activeWorkerRef);
          onDisconnect(activeWorkerRef).cancel();
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

      // Save timer state to Firebase AFTER setting local state
      setTimeout(() => {
        saveTimerState(false, seconds);
      }, 50);
    },
    [dispatch, user, reduxTasks]
  );

  return { handleStop };
}