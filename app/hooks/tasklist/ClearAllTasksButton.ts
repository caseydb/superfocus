import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../store/store";
import { useInstance } from "../../Components/Instances";
import { deleteTask } from "../../store/taskSlice";

export function useClearAllTasksButton() {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useInstance();
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);

  const confirmClearAll = useCallback(
    (setShowClearAllConfirm: (show: boolean) => void) => {
      if (user?.id) {
        // Clear all tasks by deleting each one
        reduxTasks.forEach((task) => {
          dispatch(deleteTask(task.id));
        });
      }
      setShowClearAllConfirm(false);
    },
    [dispatch, user, reduxTasks]
  );

  const clearAll = useCallback(
    (
      setShowClearMenu: (show: boolean) => void,
      setShowClearAllConfirm: (show: boolean) => void
    ) => {
      setShowClearMenu(false);
      setShowClearAllConfirm(true);
    },
    []
  );

  return { clearAll, confirmClearAll };
}