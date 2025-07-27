import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store/store";
import { useInstance } from "../Components/Instances";
import { rtdb } from "../../lib/firebase";
import { ref, set, push, remove } from "firebase/database";
import {
  updateTask,
  endTimeSegment,
  cleanupTaskFromBuffer,
  setActiveTask,
} from "../store/taskSlice";

interface QuitButtonOptions {
  timerSeconds: number;
  task: string;
  localVolume: number;
  setTimerRunning: (running: boolean) => void;
  setTask: (task: string) => void;
  setTimerResetKey: (fn: (prev: number) => number) => void;
  setInputLocked: (locked: boolean) => void;
  setHasStarted: (started: boolean) => void;
  setShowQuitModal: (show: boolean) => void;
  heartbeatIntervalRef?: React.MutableRefObject<NodeJS.Timeout | null>;
}

const MIN_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export function useQuitButton() {
  const dispatch = useDispatch<AppDispatch>();
  const { user, currentInstance } = useInstance();
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);

  const notifyEvent = useCallback(
    (type: "quit", duration: number) => {
      if (currentInstance && user?.id) {
        const eventId = `${user.id}-${type}-${Date.now()}`;
        const eventRef = ref(rtdb, `GlobalEffects/${currentInstance.id}/events/${eventId}`);
        const eventData = {
          displayName: user.displayName,
          userId: user.id,
          type,
          timestamp: Date.now(),
          duration,
        };

        set(eventRef, eventData);

        // Auto-cleanup old events after 10 seconds
        setTimeout(() => {
          import("firebase/database").then(({ remove }) => {
            remove(eventRef);
          });
        }, 10000);
      }
    },
    [currentInstance, user]
  );

  const handleQuitConfirm = useCallback(
    async (options: QuitButtonOptions) => {
      const {
        timerSeconds,
        task,
        localVolume,
        setTimerRunning,
        setTask,
        setTimerResetKey,
        setInputLocked,
        setHasStarted,
        setShowQuitModal,
        heartbeatIntervalRef,
      } = options;

      // PRIORITY 1: Clear heartbeat interval FIRST to prevent interference
      if (heartbeatIntervalRef?.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      if (timerSeconds > 0 && currentInstance && user && task.trim()) {
        const hours = Math.floor(timerSeconds / 3600)
          .toString()
          .padStart(2, "0");
        const minutes = Math.floor((timerSeconds % 3600) / 60)
          .toString()
          .padStart(2, "0");
        const secs = (timerSeconds % 60).toString().padStart(2, "0");
        const historyRef = ref(rtdb, `rooms/${currentInstance.id}/history`);
        const quitData = {
          userId: user.id,
          displayName: user.displayName,
          task: task + " (Quit Early)",
          duration: `${hours}:${minutes}:${secs}`,
          timestamp: Date.now(),
          completed: false,
        };
        push(historyRef, quitData);

        // Also add to global completed tasks (will be filtered out from stats due to "Quit Early")
        if (typeof window !== "undefined") {
          const windowWithTask = window as Window & { addCompletedTask?: (task: typeof quitData) => void };
          if (windowWithTask.addCompletedTask) {
            windowWithTask.addCompletedTask(quitData);
          }
        }

        // Always play quit sound locally
        const quitAudio = new Audio("/quit.mp3");
        quitAudio.volume = localVolume;
        quitAudio.play();

        // Only notify quit to RTDB if minimum duration is met
        if (user?.id && currentInstance && timerSeconds >= MIN_DURATION_MS / 1000) {
          notifyEvent("quit", timerSeconds);
        }

        // Always add flying message for quit to GlobalEffects
        const flyingMessageId = `${user.id}-quit-${Date.now()}`;
        const flyingMessageRef = ref(rtdb, `GlobalEffects/${currentInstance.id}/flyingMessages/${flyingMessageId}`);
        set(flyingMessageRef, {
          text: `💀 ${user.displayName} folded faster than a lawn chair.`,
          color: "text-red-500",
          userId: user.id,
          timestamp: Date.now(),
        });

        // Auto-remove the message after 7 seconds
        setTimeout(() => {
          remove(flyingMessageRef);
        }, 7000);

        // Remove ActiveWorker immediately when quitting
        const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
        remove(activeWorkerRef);

        // Clean up everything related to this task - make it like it was never started
        // Use activeTaskId if available (more reliable after reload), otherwise find by name
        let taskIdToClean = activeTaskId;
        if (!taskIdToClean) {
          const activeTask = reduxTasks.find((t) => t.name === task?.trim());
          taskIdToClean = activeTask?.id || null;
        }
        
        console.log('[QuitButton] Attempting to clean up task:', {
          taskIdToClean,
          activeTaskId,
          task: task?.trim(),
          userId: user?.id,
          reduxTasks: reduxTasks.map(t => ({ id: t.id, name: t.name, status: t.status }))
        });
        
        if (taskIdToClean && user?.id) {
          // Try to end time segment if it exists, but don't fail if it doesn't
          try {
            await dispatch(
              endTimeSegment({
                taskId: taskIdToClean,
                firebaseUserId: user.id,
              })
            ).unwrap();
          } catch {
            // Task might not be in TaskBuffer, that's OK - continue with cleanup
          }

          // Clean up task from TaskBuffer without transferring to Postgres
          try {
            console.log('[QuitButton] Cleaning up TaskBuffer for task:', taskIdToClean);
            await dispatch(
              cleanupTaskFromBuffer({
                taskId: taskIdToClean,
                firebaseUserId: user.id,
              })
            ).unwrap();
            console.log('[QuitButton] Successfully cleaned up TaskBuffer');
          } catch (error) {
            console.log('[QuitButton] Failed to clean up TaskBuffer:', error);
            // Task might not be in TaskBuffer, that's OK
          }

          // Manually reset the task in Redux to ensure it's in virgin state
          dispatch(
            updateTask({
              id: taskIdToClean,
              updates: {
                status: "not_started" as const,
                timeSpent: 0,
                lastActive: undefined,
              },
            })
          );

          // Clear active task
          dispatch(setActiveTask(null));
        }

        // Remove user from activeUsers when quitting
        const activeRef = ref(rtdb, `rooms/${currentInstance.id}/activeUsers/${user.id}`);
        remove(activeRef);
      }

      // MOVED OUTSIDE: ROBUST CLEANUP - Always clear ALL TaskBuffer data for this user when quitting
      // This ensures we don't have orphaned tasks after quit, regardless of timer state
      if (user?.id) {
        console.log('[QuitButton] Performing NUCLEAR TaskBuffer cleanup for user:', user.id);
        const userTaskBufferRef = ref(rtdb, `TaskBuffer/${user.id}`);
        
        // Remove the entire TaskBuffer for this user
        try {
          await remove(userTaskBufferRef);
          console.log('[QuitButton] Successfully nuked entire TaskBuffer for user');
        } catch (error) {
          console.log('[QuitButton] Error nuking TaskBuffer:', error);
        }
      }

      // ALWAYS clear the active task from Redux, regardless of conditions
      dispatch(setActiveTask(null));
      
      // Reset all UI state
      setTimerRunning(false);
      setTask("");  // Clear the task
      setTimerResetKey((k) => k + 1);
      setInputLocked(false);
      setHasStarted(false);
      setShowQuitModal(false);
      
      console.log('[QuitButton] Cleared all state after quit');
    },
    [dispatch, user, currentInstance, reduxTasks, activeTaskId, notifyEvent]
  );

  const handlePushOn = useCallback((setShowQuitModal: (show: boolean) => void) => {
    setShowQuitModal(false);
  }, []);

  return { handleQuitConfirm, handlePushOn };
}