import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../store/store";
import { useInstance } from "../../Components/Instances";
import { v4 as uuidv4 } from "uuid";
import { addTask, createTaskThunk, saveToCache } from "../../store/taskSlice";
import { updateUserActivity } from "../../utils/updateUserActivity";

export function useAddTaskButton() {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useInstance();
  const reduxUser = useSelector((state: RootState) => state.user);

  const handleAddTask = useCallback(
    (newTaskText: string, setNewTaskText: (text: string) => void) => {
      if (newTaskText.trim() && user?.id) {
        // Generate proper UUID
        const taskId = uuidv4();

        // Add optimistic task immediately (works for both guests and authenticated users)
        dispatch(
          addTask({
            id: taskId,
            name: newTaskText.trim(),
          })
        );

        if (reduxUser.isGuest) {
          // For guest users, just save to cache
          dispatch(saveToCache());
        } else if (reduxUser.user_id) {
          // For authenticated users, persist to database
          dispatch(
            createTaskThunk({
              id: taskId,
              name: newTaskText.trim(),
              userId: reduxUser.user_id, // Use PostgreSQL UUID
            })
          );

          // Update user's last_active timestamp (only for authenticated users)
          updateUserActivity();
        }

        setNewTaskText("");
      }
    },
    [dispatch, user, reduxUser]
  );

  return { handleAddTask };
}