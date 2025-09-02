// Hook to automatically save tasks to cache for guest users
import { useCallback, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../store/store";
import { saveToCache } from "../store/taskSlice";

export function useGuestTaskCache() {
  const dispatch = useDispatch<AppDispatch>();
  const isGuest = useSelector((state: RootState) => state.user.isGuest);
  const tasks = useSelector((state: RootState) => state.tasks.tasks);
  
  // Auto-save to cache whenever tasks change (for guest users only)
  useEffect(() => {
    if (isGuest && tasks.length > 0) {
      // Debounce saves to avoid too frequent writes
      const timer = setTimeout(() => {
        dispatch(saveToCache());
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [tasks, isGuest, dispatch]);
  
  // Wrapper for task operations that ensures cache is saved
  const wrapTaskOperation = useCallback(
    (operation: () => void) => {
      operation();
      if (isGuest) {
        // Save immediately for important operations
        dispatch(saveToCache());
      }
    },
    [isGuest, dispatch]
  );
  
  return { wrapTaskOperation, isGuest };
}