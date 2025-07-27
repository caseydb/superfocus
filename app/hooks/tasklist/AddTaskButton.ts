import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../store/store";
import { useInstance } from "../../Components/Instances";
import { v4 as uuidv4 } from "uuid";
import { addTask, createTaskThunk } from "../../store/taskSlice";

export function useAddTaskButton() {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useInstance();
  const reduxUser = useSelector((state: RootState) => state.user);

  const handleAddTask = useCallback(
    (newTaskText: string, setNewTaskText: (text: string) => void) => {
      if (newTaskText.trim() && user?.id && reduxUser.user_id) {
        // Generate proper UUID
        const taskId = uuidv4();

        // Add optimistic task immediately
        dispatch(
          addTask({
            id: taskId,
            name: newTaskText.trim(),
          })
        );

        // Persist to database using PostgreSQL user ID
        dispatch(
          createTaskThunk({
            id: taskId,
            name: newTaskText.trim(),
            userId: reduxUser.user_id, // Use PostgreSQL UUID
          })
        );

        setNewTaskText("");
      }
    },
    [dispatch, user, reduxUser]
  );

  return { handleAddTask };
}