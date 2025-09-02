import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../store/store";
import { useInstance } from "../../Components/Instances";
import { deleteTask, deleteTaskThunk, saveToCache } from "../../store/taskSlice";

export function useDeleteTaskButton() {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useInstance();
  const reduxUser = useSelector((state: RootState) => state.user);

  const removeTask = useCallback(
    (id: string) => {
      if (user?.id) {
        // First remove from Redux optimistically (works for both guests and authenticated)
        dispatch(deleteTask(id));

        if (reduxUser.isGuest) {
          // For guest users, just save to cache
          dispatch(saveToCache());
        } else if (reduxUser.user_id) {
          // For authenticated users, delete from database and Firebase TaskBuffer
          dispatch(
            deleteTaskThunk({
              id,
              userId: reduxUser.user_id,
              firebaseUserId: user.id, // Firebase Auth ID
            })
          );
        }
      }
    },
    [dispatch, user, reduxUser]
  );

  return { removeTask };
}