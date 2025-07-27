import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../store/store";
import { useInstance } from "../../Components/Instances";
import { deleteTask, deleteTaskThunk } from "../../store/taskSlice";

export function useDeleteTaskButton() {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useInstance();
  const reduxUser = useSelector((state: RootState) => state.user);

  const removeTask = useCallback(
    (id: string) => {
      if (user?.id && reduxUser.user_id) {
        // First remove from Redux optimistically
        dispatch(deleteTask(id));

        // Then delete from database and Firebase TaskBuffer
        dispatch(
          deleteTaskThunk({
            id,
            userId: reduxUser.user_id,
            firebaseUserId: user.id, // Firebase Auth ID
          })
        );
      }
    },
    [dispatch, user, reduxUser]
  );

  return { removeTask };
}