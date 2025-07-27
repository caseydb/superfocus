import { useCallback, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store/store";
import { useInstance } from "../Components/Instances";
import { rtdb } from "../../lib/firebase";
import { ref, set, remove, onDisconnect } from "firebase/database";
import {
  updateTask,
  transferTaskToPostgres,
} from "../store/taskSlice";
import { setIsActive } from "../store/realtimeSlice";
import { addHistoryEntry } from "../store/historySlice";
import { updateLeaderboardOptimistically, refreshLeaderboard } from "../store/leaderboardSlice";

interface CompleteButtonOptions {
  task: string;
  seconds: number;
  localVolume: number;
  clearTimerState: () => void;
  onComplete?: (duration: string) => void;
  setIsCompleting: (completing: boolean) => void;
  heartbeatIntervalRef?: React.MutableRefObject<NodeJS.Timeout | null>;
}

const MIN_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export function useCompleteButton() {
  const dispatch = useDispatch<AppDispatch>();
  const { user, currentInstance } = useInstance();
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const reduxUser = useSelector((state: RootState) => state.user);
  const [showCompleteFeedback, setShowCompleteFeedback] = useState(false);

  const formatTime = (s: number) => {
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const secs = (s % 60).toString().padStart(2, "0");

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes}:${secs}`;
    } else {
      return `${minutes}:${secs}`;
    }
  };

  const notifyEvent = useCallback(
    (type: "complete", duration: number) => {
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

  const handleComplete = useCallback(
    async (options: CompleteButtonOptions) => {
      const { task, seconds, localVolume, clearTimerState, onComplete, setIsCompleting, heartbeatIntervalRef } =
        options;

      // Prevent multiple clicks
      if (showCompleteFeedback) {
        setShowCompleteFeedback(true);
        setTimeout(() => setShowCompleteFeedback(false), 300);
        return;
      }

      setIsCompleting(true);

      // Play completion sound immediately for instant feedback
      const completeAudio = new Audio("/complete.mp3");
      completeAudio.volume = localVolume;
      completeAudio.play();

      const completionTime = formatTime(seconds);

      // Mark today as completed for streak tracking
      if (typeof window !== "undefined") {
        const windowWithStreak = window as Window & { markStreakComplete?: () => Promise<void> };
        if (windowWithStreak.markStreakComplete) {
          windowWithStreak.markStreakComplete();
        }
      }

      // Only send complete event to RTDB if minimum duration is met
      if (seconds >= MIN_DURATION_MS / 1000) {
        notifyEvent("complete", seconds);
      }

      // Optimistically update task status to completed
      const activeTask = reduxTasks.find((t) => t.name === task?.trim());
      if (activeTask?.id) {
        dispatch(
          updateTask({
            id: activeTask.id,
            updates: { status: "completed" as const, completed: true },
          })
        );
      }

      // Transfer task to Postgres
      const activeTaskForTransfer = reduxTasks.find((t) => t.name === task?.trim());

      if (activeTaskForTransfer?.id && user?.id) {
        if (typeof window !== "undefined") {
          const token = localStorage.getItem("firebase_token") || "";

          try {
            const result = await dispatch(
              transferTaskToPostgres({
                taskId: activeTaskForTransfer.id,
                firebaseUserId: user.id,
                status: "completed",
                token,
                duration: seconds,
              })
            ).unwrap();

            // Add optimistic update to history
            if (result && result.savedTask && reduxUser?.user_id) {
              dispatch(
                addHistoryEntry({
                  taskId: result.savedTask.id,
                  userId: reduxUser.user_id,
                  displayName: `${reduxUser.first_name || ""} ${reduxUser.last_name || ""}`.trim() || "Anonymous",
                  taskName: result.savedTask.task_name || task || "Unnamed Task",
                  duration: seconds,
                })
              );

              // Update leaderboard optimistically and refresh from server
              dispatch(
                updateLeaderboardOptimistically({
                  userId: reduxUser.user_id,
                  firstName: reduxUser.first_name || "",
                  lastName: reduxUser.last_name || "",
                  profileImage: reduxUser.profile_image || null,
                  taskDuration: seconds,
                })
              );

              // Refresh leaderboard from server to get accurate totals
              dispatch(refreshLeaderboard());
            }

            // Clear heartbeat interval
            if (heartbeatIntervalRef?.current) {
              clearInterval(heartbeatIntervalRef.current);
              heartbeatIntervalRef.current = null;
            }

            // Remove ActiveWorker on completion
            if (user?.id) {
              const activeWorkerRef = ref(rtdb, `ActiveWorker/${user.id}`);
              remove(activeWorkerRef);
              onDisconnect(activeWorkerRef).cancel();
            }

            clearTimerState(); // Clear Firebase state when completing
            dispatch(setIsActive(false)); // Update Redux state

            // Reset completing state after 2 seconds
            setTimeout(() => {
              setIsCompleting(false);
            }, 2000);
          } catch (error) {
            // Show error message to user
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            alert(`Failed to save task completion: ${errorMessage}`);

            // Reset completing state immediately on error so user can retry
            setIsCompleting(false);
          } finally {
            // Always call onComplete callback, even if saving failed
            if (onComplete) {
              onComplete(completionTime);
            }
          }
        }
      }
    },
    [dispatch, user, reduxTasks, reduxUser, notifyEvent, showCompleteFeedback]
  );

  return { handleComplete, showCompleteFeedback };
}