import { useCallback, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "../store/store";
import { useInstance } from "../Components/Instances";
import { rtdb } from "../../lib/firebase";
import { ref, remove, set } from "firebase/database";
import { PresenceService } from "../utils/presenceService";
import { playAudio } from "../utils/activeAudio";
import { updateUserActivity } from "../utils/updateUserActivity";
import {
  updateTask,
  transferTaskToPostgres,
  setActiveTask,
  saveToCache,
} from "../store/taskSlice";
import { setIsActive } from "../store/realtimeSlice";
import { addHistoryEntry } from "../store/historySlice";
import { updateLeaderboardOptimistically, refreshLeaderboard } from "../store/leaderboardSlice";
import { resetInput } from "../store/taskInputSlice";
import { updateUser, updateUserData } from "../store/userSlice";

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
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);
  const { currentTaskId } = useSelector((state: RootState) => state.taskInput);
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
    async (type: "complete", duration: number) => {
      if (reduxUser.isGuest || !currentInstance || !user?.id) {
        return;
      }
        // Use Redux user data which is already loaded and accurate
        const firstName = reduxUser?.first_name || "";
        const lastName = reduxUser?.last_name || "";
        
        const eventId = `${user.id}-${type}-${Date.now()}`;
        const eventRef = ref(rtdb, `GlobalEffects/${currentInstance.id}/events/${eventId}`);
        const eventData = {
          displayName: user.displayName, // Keep for backward compatibility
          firstName,
          lastName,
          userId: user.id,
          authId: reduxUser?.auth_id, // Add auth ID to event data
          type,
          timestamp: Date.now(),
          duration,
        };

        set(eventRef, eventData);

      // Auto-cleanup event after 5 seconds (ephemeral)
      setTimeout(() => {
        import("firebase/database").then(({ remove }) => {
          remove(eventRef);
        });
      }, 5000);
    },
    [currentInstance, user, reduxUser]
  );

  const handleComplete = useCallback(
    async (options: CompleteButtonOptions) => {
      const { task, seconds, localVolume, clearTimerState, onComplete, setIsCompleting, heartbeatIntervalRef } =
        options;
      
      // Removed debug console logging for production cleanliness

      // Prevent multiple clicks
      if (showCompleteFeedback) {
        setShowCompleteFeedback(true);
        setTimeout(() => setShowCompleteFeedback(false), 300);
        return;
      }

      setIsCompleting(true);

      // PRIORITY 1: Clear heartbeat interval FIRST to prevent interference
      if (heartbeatIntervalRef?.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      // PRIORITY 2: Play completion sound immediately for instant feedback
      playAudio("/complete.mp3", localVolume);

      const completionTime = formatTime(seconds);

      // PRIORITY 3: Send global effect immediately
      if (seconds >= MIN_DURATION_MS / 1000) {
        notifyEvent("complete", seconds);
      }

      // Update user's last_active timestamp
      if (!reduxUser.isGuest) {
        updateUserActivity();
      }

      // PRIORITY 4: Update presence to inactive
      if (!reduxUser.isGuest && user?.id && currentInstance) {
        PresenceService.updateUserPresence(user.id, currentInstance.id, false);
      }

      // PRIORITY 5: Clear timer state AND LastTask immediately
      const taskId = activeTaskId || currentTaskId;
      
      // CRITICAL: Remove LastTask immediately (authenticated users only)
      if (user?.id && !reduxUser.isGuest) {
        const lastTaskRef = ref(rtdb, `TaskBuffer/${user.id}/LastTask`);
        remove(lastTaskRef);
      }
      
      clearTimerState();
      dispatch(setIsActive(false));
      dispatch(resetInput());

      // Legacy Firebase streak bridge removed

      // Optimistically update user streak in Redux and persist to Postgres
      try {
        // Compute current streak from tasks including this completion
        const toTimestamp = (dateValue: string | number | Date | undefined): number => {
          if (!dateValue && dateValue !== 0) return 0;
          if (typeof dateValue === "string") return new Date(dateValue).getTime();
          if (typeof dateValue === "number") return dateValue;
          if (dateValue instanceof Date) return dateValue.getTime();
          return 0;
        };

        const timezone = reduxUser.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });

        const dayStr = (ts: number) => {
          const parts = formatter.formatToParts(new Date(ts));
          const map = parts.reduce((acc, p) => {
            acc[p.type] = p.value;
            return acc;
          }, {} as Record<string, string>);
          return `${map.year}-${map.month}-${map.day}`;
        };

        // Simulate the just-completed task being completed with a timestamp now
        const now = Date.now();
        const completedTaskId = taskId;
        const simulatedTasks = reduxTasks.map((t) =>
          completedTaskId && t.id === completedTaskId
            ? { ...t, status: "completed" as const, completed: true, completedAt: now }
            : t
        );

        // Build a set of unique completed day strings
        const completedSet = new Set<string>();
        for (const t of simulatedTasks) {
          if (t.status === "completed" || t.completed) {
            const ts = toTimestamp(t.completedAt || t.createdAt);
            if (ts) completedSet.add(dayStr(ts));
          }
        }

        // Count current streak working back from today in the user's timezone
        let currentStreak = 0;
        const today = dayStr(now);
        const oneDayMs = 24 * 60 * 60 * 1000;

        // Helper to get previous day in tz by subtracting 24h and reformatting
        const prevDayStr = (refTs: number) => dayStr(refTs - oneDayMs);

        let cursorStr = today;
        if (completedSet.has(cursorStr)) {
          // Count consecutive days starting today
          while (completedSet.has(cursorStr)) {
            currentStreak++;
            // Step back using refTs to avoid parsing cursorStr; use now - k*24h
            const stepTs = now - currentStreak * oneDayMs;
            cursorStr = dayStr(stepTs);
          }
        } else {
          // Try starting from yesterday
          const yStr = prevDayStr(now);
          if (completedSet.has(yStr)) {
            cursorStr = yStr;
            while (completedSet.has(cursorStr)) {
              currentStreak++;
              const stepTs = now - currentStreak * oneDayMs;
              cursorStr = dayStr(stepTs);
            }
          } else {
            currentStreak = 0;
          }
        }

        // Optimistically set Redux user streak
        dispatch(updateUser({ streak: currentStreak }));

        // Persist streak to Postgres for authenticated users
        if (!reduxUser.isGuest) {
          dispatch(updateUserData({ streak: currentStreak })).catch(() => {
            // Silent fail; UI already updated optimistically
          });
        }
      } catch {
        // Do not block completion flow on streak calculation failure
      }

      // Optimistically update task status to completed
      // taskId already defined above for logging
      if (taskId) {
        dispatch(
          updateTask({
            id: taskId,
            updates: { status: "completed" as const, completed: true, completedAt: Date.now() },
          })
        );
        // IMPORTANT: Clear activeTaskId immediately to prevent RoomShell from restoring the input
        dispatch(setActiveTask(null));
      }

      // Always call onComplete callback immediately for UI updates
      if (onComplete) {
        onComplete(completionTime);
      }

      // Reset completing state after 2 seconds
      setTimeout(() => {
        setIsCompleting(false);
      }, 2000);

      // Check milestones IMMEDIATELY after completion - only for authenticated users
      if (reduxUser?.user_id && typeof window !== "undefined" && !reduxUser.isGuest) {
        // Fire and forget milestone check
        (async () => {
          try {
            const response = await fetch("/api/user/milestones/check", {
              headers: {
                "X-User-Id": reduxUser.user_id!,
              },
            });

            if (response.ok) {
              const data = await response.json();
              if (data.success && data.data.shouldShowPopup) {
                // Dispatch event to show milestone popup
                window.dispatchEvent(new CustomEvent("showMilestoneInvite", {
                  detail: {
                    milestone: data.data.milestone,
                    stats: data.data.stats
                  }
                }));
              }
            }
          } catch {
            // Silently fail - milestones are not critical
          }
        })();
      }

      // Transfer task to Postgres - NON-BLOCKING (only for authenticated users)
      const taskIdForTransfer = activeTaskId || currentTaskId;

      if (taskIdForTransfer && user?.id && !reduxUser.isGuest) {
        if (typeof window !== "undefined") {
          const token = localStorage.getItem("firebase_token") || "";

          // Fire and forget - don't await, don't block UI
          dispatch(
            transferTaskToPostgres({
              taskId: taskIdForTransfer,
              firebaseUserId: user.id,
              status: "completed",
              token,
              duration: seconds,
            })
          )
            .unwrap()
            .then(async (result) => {
              // Handle success in background
              if (result && result.alreadyCompleted) {
                // Task was already completed - this is normal behavior
                return;
              }
              
              if (result && result.savedTask && reduxUser?.user_id) {
                // Get task name from the saved task or find it in Redux
                const taskFromRedux = reduxTasks.find(t => t.id === taskIdForTransfer);
                const taskName = result.savedTask.task_name || taskFromRedux?.name || task || "Unnamed Task";
                
                dispatch(
                  addHistoryEntry({
                    taskId: result.savedTask.id,
                    userId: reduxUser.user_id,
                    displayName: `${reduxUser.first_name || ""} ${reduxUser.last_name || ""}`.trim() || "Anonymous",
                    taskName: taskName,
                    duration: seconds,
                  })
                );

                // Update leaderboard optimistically and refresh from server
                dispatch(
                  updateLeaderboardOptimistically({
                    userId: reduxUser.user_id,
                    authId: reduxUser.auth_id || user.id, // Fallback to Firebase user.id if auth_id not available yet
                    firstName: reduxUser.first_name || "",
                    lastName: reduxUser.last_name || "",
                    profileImage: reduxUser.profile_image || null,
                    taskDuration: seconds,
                  })
                );

                // Refresh leaderboard from server to get accurate totals
                dispatch(refreshLeaderboard());

                // History and leaderboard are already refreshed above
                // Other users will see updates when they next load or via polling
              }
            })
            .catch((error) => {
              // Log error but don't block UI
              console.error("[CompleteButton] Background task save failed:", error);
              const errorMessage = error instanceof Error ? error.message : "Unknown error";
              // Optional: Show a non-blocking notification instead of alert
              console.warn(`Failed to save task completion: ${errorMessage}`);
            });
        }
      } else if (reduxUser.isGuest && taskIdForTransfer) {
        // For guest users, just save completed task to cache
        dispatch(saveToCache());
      }
    },
    [dispatch, user, reduxUser, reduxTasks, activeTaskId, currentTaskId, notifyEvent, showCompleteFeedback, currentInstance]
  );

  return { handleComplete, showCompleteFeedback };
}
