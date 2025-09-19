import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../store/store";
import { useInstance } from "../../Components/Instances";
import { deleteTask, deleteTaskThunk, saveToCache, setActiveTask, cleanupTaskFromBuffer } from "../../store/taskSlice";
import { rtdb } from "../../../lib/firebase";
import { ref, set, remove } from "firebase/database";

export function useDeleteTaskButton() {
  const dispatch = useDispatch<AppDispatch>();
  const { user, currentInstance } = useInstance();
  const reduxUser = useSelector((state: RootState) => state.user);
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);

  const removeTask = useCallback(
    (id: string) => {
      const firebaseUserId = user?.id;
      const isGuest = reduxUser.isGuest;

      // Determine if this task has any time or is currently active
      const task = reduxTasks.find((t) => t.id === id);
      const hasTime = (task?.timeSpent || 0) > 0;
      const isActive = activeTaskId === id;

      // If there is time or the task is active, clear from TaskBuffer first (authenticated users only)
      if (!isGuest && firebaseUserId && (hasTime || isActive)) {
        dispatch(cleanupTaskFromBuffer({ taskId: id, firebaseUserId }));

        // Trigger global effect: folded like a lawn chair
        if (currentInstance) {
          const flyingMessageId = `${firebaseUserId}-delete-${Date.now()}`;
          const flyingMessageRef = ref(
            rtdb,
            `GlobalEffects/${currentInstance.id}/flyingMessages/${flyingMessageId}`
          );
          set(flyingMessageRef, {
            text: `💀 ${(user?.displayName ?? "Guest")} folded faster than a lawn chair.`,
            color: "text-red-500",
            userId: firebaseUserId,
            timestamp: Date.now(),
          });
          // Auto-remove after 5 seconds
          setTimeout(() => {
            remove(flyingMessageRef);
          }, 5000);
        }
      }

      // Optimistically remove from Redux
      dispatch(deleteTask(id));
      if (isActive) {
        dispatch(setActiveTask(null));
      }

      if (isGuest) {
        // Persist local changes for guests
        dispatch(saveToCache());
      } else if (reduxUser.user_id && firebaseUserId) {
        // Authenticated: delete from Postgres and remove from TaskBuffer
        dispatch(
          deleteTaskThunk({
            id,
            userId: reduxUser.user_id,
            firebaseUserId,
          })
        );
      }
    },
    [dispatch, user, reduxUser, reduxTasks, activeTaskId, currentInstance]
  );

  return { removeTask };
}
