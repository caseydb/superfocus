import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../store/store";
import { setActiveTask } from "../../store/taskSlice";
import { setCurrentTask } from "../../store/taskInputSlice";
import { rtdb } from "../../../lib/firebase";
import { ref, remove } from "firebase/database";
import { useInstance } from "../../Components/Instances";

export function useStartTaskButton() {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useInstance();
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);
  const isTimerActive = useSelector((state: RootState) => state.realtime.isActive);
  
  const handleStartTask = useCallback(
    (taskId: string, taskText: string, onStartTask?: (text: string) => void, onPauseFirst?: () => void) => {
      // IMPORTANT: Check BEFORE updating Redux state
      const needsToPause = isTimerActive && activeTaskId && activeTaskId !== taskId;
      
      if (needsToPause && onPauseFirst) {
        // First pause the current task
        onPauseFirst();
        
        // Then wait and start the new task
        setTimeout(() => {
          // Clear the justCompletedTask flag when selecting a new task
          if (user?.id) {
            const completedFlagRef = ref(rtdb, `TaskBuffer/${user.id}/justCompletedTask`);
            remove(completedFlagRef).catch(() => {
              // Silently fail if flag doesn't exist
            });
          }
          
          // Set the current task ID and name in Redux
          dispatch(setCurrentTask({ id: taskId, name: taskText }));
          dispatch(setActiveTask(taskId));
          
          if (onStartTask) {
            onStartTask(taskText);
          }
        }, 500); // Increased delay to ensure pause completes
      } else {
        // Clear the justCompletedTask flag when selecting a new task
        if (user?.id) {
          const completedFlagRef = ref(rtdb, `TaskBuffer/${user.id}/justCompletedTask`);
          remove(completedFlagRef).catch(() => {
            // Silently fail if flag doesn't exist
          });
        }
        
        // No need to pause, just start
        dispatch(setCurrentTask({ id: taskId, name: taskText }));
        dispatch(setActiveTask(taskId));
        
        if (onStartTask) {
          onStartTask(taskText);
        }
      }
    },
    [dispatch, activeTaskId, isTimerActive, user]
  );

  return { handleStartTask };
}