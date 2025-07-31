import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../../store/store";
import { setActiveTask } from "../../store/taskSlice";
import { setCurrentTask } from "../../store/taskInputSlice";

export function useStartTaskButton() {
  const dispatch = useDispatch<AppDispatch>();
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);
  const isTimerActive = useSelector((state: RootState) => state.realtime.isActive);
  
  const handleStartTask = useCallback(
    (taskId: string, taskText: string, onStartTask?: (text: string) => void, onPauseFirst?: () => void) => {
      console.log('[StartTaskButton] handleStartTask called with:', {
        taskId,
        taskText,
        isTimerActive,
        activeTaskId,
        needsPause: isTimerActive && activeTaskId && activeTaskId !== taskId,
        hasPauseFunction: !!onPauseFirst
      });
      
      // IMPORTANT: Check BEFORE updating Redux state
      const needsToPause = isTimerActive && activeTaskId && activeTaskId !== taskId;
      
      if (needsToPause && onPauseFirst) {
        console.log('[StartTaskButton] Timer running with different task, pausing first:', activeTaskId, '->', taskId);
        
        // First pause the current task
        onPauseFirst();
        
        // Then wait and start the new task
        setTimeout(() => {
          console.log('[StartTaskButton] After pause delay, setting task and starting');
          // Set the current task ID and name in Redux
          dispatch(setCurrentTask({ id: taskId, name: taskText }));
          dispatch(setActiveTask(taskId));
          
          if (onStartTask) {
            console.log('[StartTaskButton] Calling onStartTask');
            onStartTask(taskText);
          }
        }, 500); // Increased delay to ensure pause completes
      } else {
        console.log('[StartTaskButton] No pause needed, starting directly');
        // No need to pause, just start
        dispatch(setCurrentTask({ id: taskId, name: taskText }));
        dispatch(setActiveTask(taskId));
        
        if (onStartTask) {
          console.log('[StartTaskButton] Calling onStartTask');
          onStartTask(taskText);
        }
      }
    },
    [dispatch, activeTaskId, isTimerActive]
  );

  return { handleStartTask };
}