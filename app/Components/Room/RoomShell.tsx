"use client";
import React, { useEffect, useState, useRef } from "react";
import { useInstance } from "../Instances";
import { useRouter } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { setActiveTask } from "../../store/taskSlice";
import { fetchHistory } from "../../store/historySlice";
import { refreshLeaderboard } from "../../store/leaderboardSlice";
import { rtdb } from "../../../lib/firebase";
import type { Instance } from "../../types";
import {
  ref,
  onValue,
  off,
  set,
  remove,
  push,
  runTransaction,
  get,
  query,
  orderByChild,
  limitToLast,
} from "firebase/database";
import ActiveWorkers from "./ActiveWorkers";
import TaskInput from "./TaskInput";
import Timer from "./Timer";
import Pomodoro from "./Pomodoro";
import History from "./History";
import Analytics from "./Analytics";
import Controls from "./Controls";
import FlyingMessages from "./FlyingMessages";
import Leaderboard from "./Leaderboard";
import Sounds from "./Sounds";
import TaskList from "./TaskList";
import PersonalStats from "./PersonalStats";
import WelcomeBackMessage from "./WelcomeBackMessage";
import RoomsModal from "./RoomsModal";
import Notes from "./Notes";
import SignIn from "../SignIn";
import Preferences from "./Preferences";
import { signInWithGoogle } from "@/lib/auth";
import Image from "next/image";
import { getPublicRoomByUrl, addUserToPublicRoom, removeUserFromPublicRoom } from "@/app/utils/publicRooms";
import { PublicRoomPresence } from "@/app/utils/publicRoomPresence";
import { DotSpinner } from "ldrs/react";
import "ldrs/react/DotSpinner.css";
import { startCleanupScheduler } from "@/app/utils/cleanupScheduler";
import { getPrivateRoomByUrl, addUserToPrivateRoom, removeUserFromPrivateRoom } from "@/app/utils/privateRooms";
import { PrivateRoomPresence } from "@/app/utils/privateRoomPresence";
import { useClearButton } from "@/app/hooks/ClearButton";
import { useQuitButton } from "@/app/hooks/QuitButton";
import {
  resetInput,
  lockInput,
  unlockInput,
  setHasStarted as setHasStartedRedux,
  setCurrentInput,
} from "@/app/store/taskInputSlice";

export default function RoomShell({ roomUrl }: { roomUrl: string }) {
  const { instances, currentInstance, joinInstance, user, userReady, setPublicRoomInstance } = useInstance();
  const [loading, setLoading] = useState(true);
  const [roomFound, setRoomFound] = useState(false);
  const [publicRoomId, setPublicRoomId] = useState<string | null>(null);
  const [publicRoomPresence, setPublicRoomPresence] = useState<PublicRoomPresence | null>(null);
  const [privateRoomId, setPrivateRoomId] = useState<string | null>(null);
  const [privateRoomPresence, setPrivateRoomPresence] = useState<PrivateRoomPresence | null>(null);
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  // Get user data from Redux store
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);
  const { currentInput: task } = useSelector((state: RootState) => state.taskInput);
  const { hasStarted } = useSelector((state: RootState) => state.taskInput);
  const [timerResetKey, setTimerResetKey] = useState(0);
  const timerStartRef = React.useRef<() => void>(null!);
  const timerPauseRef = React.useRef<() => void>(null!);
  const [showHistory, setShowHistory] = useState(false);
  const timerSecondsRef = React.useRef<number>(0);
  const pomodoroRemainingRef = React.useRef<number>(0);
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [flyingMessages, setFlyingMessages] = useState<
    {
      id: string;
      text: string;
      color: string;
      userId?: string;
      timestamp: number;
    }[]
  >([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHistoryTooltip, setShowHistoryTooltip] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [showTaskList, setShowTaskList] = useState(false);
  const [showRoomsModal, setShowRoomsModal] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  // Get mode preference from Redux
  const preferences = useSelector((state: RootState) => state.preferences);
  const isPomodoroMode = preferences.mode === "countdown";
  const [showTimerDropdown, setShowTimerDropdown] = useState(false);
  const timerDropdownRef = useRef<HTMLDivElement>(null);

  // Use button hooks
  const { handleClear } = useClearButton();
  const { handleQuitConfirm, handlePushOn } = useQuitButton();

  const [localVolume, setLocalVolume] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("lockedin_volume");
      if (stored !== null) return Number(stored);
    }
    return 0.2;
  });

  // Track previous volume for mute/unmute functionality
  const [previousVolume, setPreviousVolume] = useState(0.2);

  // Local quit cooldown state
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [localQuitCooldown, setLocalQuitCooldown] = useState(0);
  const quitCooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const MIN_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  // Start cooldown state (persists across task completions)
  const [localStartCooldown, setLocalStartCooldown] = useState(0);
  const lastStartTimeRef = useRef<number>(0);
  const startCooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const START_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  // Helper function to close all modals
  const closeAllModals = React.useCallback(() => {
    setShowLeaderboard(false);
    setShowHistory(false);
    setShowInviteModal(false);
    setShowTaskList(false);
    setShowRoomsModal(false);
    setShowNotes(false);
    setShowPreferences(false);
    setShowAnalytics(false);
    setShowQuitModal(false);
    setShowSignInModal(false);
    setShowTimerDropdown(false);
  }, []);

  // Track if there's an active timer state from Redux or TaskBuffer
  const [hasTaskInBuffer, setHasTaskInBuffer] = useState(false);
  const hasActiveTimer = Boolean(activeTaskId) || hasTaskInBuffer;
  const [currentTimerSeconds, setCurrentTimerSeconds] = useState(0);

  // Check for active timer state on mount and lock input immediately
  useEffect(() => {
    if (user?.id) {
      const timerRef = ref(rtdb, `TaskBuffer/${user.id}/timer_state`);
      get(timerRef)
        .then((snapshot) => {
          const timerState = snapshot.val();
          if (timerState && timerState.taskId) {
            // Found active timer state - lock input immediately
            dispatch(lockInput());
            dispatch(setHasStartedRedux(true));

            // Calculate current seconds from timer state
            let currentSeconds = 0;
            if (timerState.running && timerState.startTime) {
              // Calculate current seconds: base + elapsed time since start
              const elapsedMs = Date.now() - timerState.startTime;
              const elapsedSeconds = Math.floor(elapsedMs / 1000);
              currentSeconds = (timerState.baseSeconds || 0) + elapsedSeconds;
            } else {
              // Use stored total seconds when paused
              currentSeconds = timerState.totalSeconds || 0;
            }

            // Update the secondsRef immediately
            timerSecondsRef.current = currentSeconds;

            // Set the active task ID immediately
            dispatch(setActiveTask(timerState.taskId));

            // Also restore the task name if we can find it
            const taskRef = ref(rtdb, `TaskBuffer/${user.id}/${timerState.taskId}`);
            get(taskRef).then((taskSnapshot) => {
              const taskData = taskSnapshot.val();
              if (taskData && taskData.name) {
                dispatch(setCurrentInput(taskData.name));
              } else {
              }
            });
          } else {
          }
        })
        .catch(() => {
          // Error handling removed - silent failure
        });
    }
  }, [user?.id, dispatch]);

  // Find taskId for current task
  useEffect(() => {
    if (!user?.id || !task.trim()) {
      setCurrentTaskId(null);
      return;
    }

    // Task list operations removed from TaskBuffer
    // Task ID should come from Redux state
    const activeTask = reduxTasks.find((t) => t.name === task.trim());
    setCurrentTaskId(activeTask?.id || null);
  }, [user?.id, task, reduxTasks]);

  // Restore active task from Redux when page loads or activeTaskId changes
  useEffect(() => {
    if (activeTaskId && !task) {
      // Find the active task in Redux tasks
      const activeTask = reduxTasks.find((t) => t.id === activeTaskId);
      // Only restore if task is not completed
      if (activeTask && activeTask.status !== "completed" && !activeTask.completed) {
        dispatch(setCurrentInput(activeTask.name));
        setCurrentTaskId(activeTask.id);

        // Lock the input if the task is in progress
        if (activeTask.status === "in_progress" || activeTask.status === "paused") {
          dispatch(lockInput());
          dispatch(setHasStartedRedux(true));
        }
      }
    }
  }, [activeTaskId, reduxTasks, task, dispatch]);

  // Timer state is now stored with the task - removed separate timer state listener

  // Timer seconds tracking removed - handled by Timer component

  // Update local quit cooldown every second
  useEffect(() => {
    const updateQuitCooldown = () => {
      if (timerRunning && currentTimerSeconds > 0) {
        const remainingDuration = Math.max(0, MIN_DURATION_MS / 1000 - currentTimerSeconds);
        setLocalQuitCooldown(Math.ceil(remainingDuration));
      } else {
        setLocalQuitCooldown(0);
      }
    };

    // Update immediately
    updateQuitCooldown();

    // Then update every second
    const interval = setInterval(updateQuitCooldown, 1000);
    quitCooldownIntervalRef.current = interval;

    return () => {
      if (quitCooldownIntervalRef.current) {
        clearInterval(quitCooldownIntervalRef.current);
      }
    };
  }, [timerRunning, currentTimerSeconds, MIN_DURATION_MS]);

  // Update start cooldown independently
  useEffect(() => {
    const updateStartCooldown = () => {
      const now = Date.now();
      if (lastStartTimeRef.current > 0) {
        const timeSinceLastStart = now - lastStartTimeRef.current;
        const remainingCooldown = Math.max(0, START_COOLDOWN_MS - timeSinceLastStart);
        setLocalStartCooldown(Math.ceil(remainingCooldown / 1000)); // Convert to seconds
      } else {
        setLocalStartCooldown(0);
      }
    };

    // Update immediately
    updateStartCooldown();

    // Then update every second
    const interval = setInterval(updateStartCooldown, 1000);
    startCooldownIntervalRef.current = interval;

    return () => {
      if (startCooldownIntervalRef.current) {
        clearInterval(startCooldownIntervalRef.current);
      }
    };
  }, [START_COOLDOWN_MS]);

  // Persist volume to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lockedin_volume", String(localVolume));
      // Update previousVolume when volume changes (but not when muting to 0)
      if (localVolume > 0) {
        setPreviousVolume(localVolume);
      }
    }
  }, [localVolume]);

  // Pause timer when switching modes
  const prevModeRef = useRef(isPomodoroMode);
  useEffect(() => {
    // Only pause if mode actually changed, not on initial mount
    if (prevModeRef.current !== isPomodoroMode && timerPauseRef.current && timerRunning) {
      timerPauseRef.current();
    }
    prevModeRef.current = isPomodoroMode;
  }, [isPomodoroMode, timerRunning]);

  useEffect(() => {
    const checkRoom = async () => {
      // If we already have a currentInstance that matches this room URL, we're good
      if (currentInstance && currentInstance.url === roomUrl) {
        setRoomFound(true);
        setLoading(false);
        // If this is a public room, store its ID and init presence
        if (currentInstance.type === "public" && !publicRoomId) {
          setPublicRoomId(currentInstance.id);

          // Initialize presence if not already done
          if (!publicRoomPresence) {
            const presence = new PublicRoomPresence(currentInstance.id, user.id);
            const joined = await presence.join();
            if (joined) {
              setPublicRoomPresence(presence);

              // Add user to PublicRoom users list and update count
              await addUserToPublicRoom(currentInstance.id, user.id, user.displayName);

              // Start cleanup scheduler to ensure orphaned rooms are cleaned
              startCleanupScheduler();
            }
          }
        }
        return;
      }

      // First check legacy instances
      const targetRoom = instances.find((instance) => instance.url === roomUrl);
      if (targetRoom) {
        setRoomFound(true);
        if (!currentInstance || currentInstance.id !== targetRoom.id) {
          joinInstance(targetRoom.id);
        }
        setLoading(false);
        return;
      }

      // If not found in legacy instances, check PublicRooms
      try {
        const publicRoom = await getPublicRoomByUrl(roomUrl);
        if (publicRoom) {
          // Only join if we're not already in this room
          if (!publicRoomId || publicRoomId !== publicRoom.id) {
            // Create presence manager
            const presence = new PublicRoomPresence(publicRoom.id, user.id);
            const joined = await presence.join();

            if (!joined) {
              // Room is full
              setRoomFound(false);
              setLoading(false);
              return;
            }

            // Store presence manager
            setPublicRoomPresence(presence);

            // Add user to PublicRoom users list and update count
            await addUserToPublicRoom(publicRoom.id, user.id, user.displayName);

            // Start cleanup scheduler to ensure orphaned rooms are cleaned
            startCleanupScheduler();
          }

          setRoomFound(true);
          // Store the public room ID for cleanup later
          setPublicRoomId(publicRoom.id);

          // Create a temporary Instance object for compatibility with the rest of the app
          // This allows PublicRooms to work with the existing UI
          const tempInstance: Instance = {
            id: publicRoom.id,
            type: "public",
            users: [user], // Just show current user for now
            createdBy: publicRoom.createdBy,
            url: publicRoom.url,
          };

          // Set this as the current instance in the context
          setPublicRoomInstance(tempInstance);
          setLoading(false);
          return;
        }
      } catch {
        // Silent error handling
      }

      // If not found in PublicRooms, check PrivateRooms
      try {
        const privateRoom = await getPrivateRoomByUrl(roomUrl);
        if (privateRoom) {
          // Only join if we're not already in this room
          if (!privateRoomId || privateRoomId !== privateRoom.id) {
            // Create presence manager for private rooms
            const presence = new PrivateRoomPresence(privateRoom.id, user.id);
            const joined = await presence.join();

            if (!joined) {
              // This shouldn't happen for private rooms, but handle it
              setRoomFound(false);
              setLoading(false);
              return;
            }

            // Store presence manager
            setPrivateRoomPresence(presence);

            // Add user to PrivateRoom users list and update count
            await addUserToPrivateRoom(privateRoom.id, user.id, user.displayName);
          }

          setRoomFound(true);
          // Store the private room ID for cleanup later
          setPrivateRoomId(privateRoom.id);

          // Create a temporary Instance object for compatibility with the rest of the app
          const tempInstance: Instance = {
            id: privateRoom.id,
            type: "private",
            users: [user], // Just show current user for now
            createdBy: privateRoom.createdBy,
            url: privateRoom.url,
          };

          // Set this as the current instance in the context
          setPublicRoomInstance(tempInstance);
          setLoading(false);
          return;
        }
      } catch {
        // Silent error handling
      }

      setRoomFound(false);
      setLoading(false);
    };

    if (userReady) {
      // Small delay to ensure Firebase writes are propagated
      const timer = setTimeout(() => {
        checkRoom();
      }, 100);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [
    instances,
    roomUrl,
    currentInstance,
    joinInstance,
    userReady,
    publicRoomId,
    privateRoomId,
    setPublicRoomInstance,
    user,
    publicRoomPresence,
    privateRoomPresence,
  ]);

  // Track user tab count to handle multi-tab scenarios
  const userTabCountRef = React.useRef(0);

  // Clean up on unmount or room change - only if this is the last tab
  useEffect(() => {
    if (!currentInstance || !user) return;

    // Path to user's tab count
    const tabCountRef = ref(rtdb, `tabCounts/${user.id}`);

    // Increment tab count when this tab opens/joins room
    runTransaction(tabCountRef, (currentData) => {
      const currentCount = currentData?.count || 0;
      const newCount = currentCount + 1;
      return {
        count: newCount,
        displayName: user.displayName,
        lastUpdated: Date.now(),
      };
    });

    // Listen to tab count changes
    const handle = onValue(tabCountRef, (snapshot) => {
      const data = snapshot.val();
      const tabCount = data?.count || 0;
      userTabCountRef.current = tabCount;

      // NOTE: Removed onDisconnect handlers - they conflict with our tab counting system
      // We rely entirely on manual tab counting via beforeunload and useEffect cleanup
    });

    // Add beforeunload listener to track page navigation/refresh
    const handleBeforeUnload = async () => {
      // Decrement tab count immediately on beforeunload for reliability
      runTransaction(tabCountRef, (currentData) => {
        const currentCount = currentData?.count || 0;
        const newCount = Math.max(0, currentCount - 1);

        if (newCount === 0) {
          // Remove the tab count entry if this was the last tab
          const activeRef = ref(rtdb, `rooms/${currentInstance.id}/activeUsers/${user.id}`);
          const usersRef = ref(rtdb, `rooms/${currentInstance.id}/users/${user.id}`);
          remove(activeRef);
          remove(usersRef); // Also remove from main users list

          // Also remove from PublicRooms if this is a public room
          if (currentInstance.type === "public" && publicRoomId) {
            removeUserFromPublicRoom(publicRoomId, user.id);
          }

          // Also remove from PrivateRooms if this is a private room
          if (currentInstance.type === "private" && privateRoomId) {
            removeUserFromPrivateRoom(privateRoomId, user.id);
          }

          return null; // Remove the entire node
        } else {
          // Just decrement the count - user still has other tabs open
          return {
            count: newCount,
            displayName: user.displayName,
            lastUpdated: Date.now(),
          };
        }
      });

      // PublicRoom cleanup is now handled by presence system
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      // Remove event listener
      window.removeEventListener("beforeunload", handleBeforeUnload);

      // Fallback cleanup when component unmounts - only decrement if tab count is still > 0
      // This handles edge cases where beforeunload didn't fire
      if (userTabCountRef.current > 0) {
        runTransaction(tabCountRef, (currentData) => {
          const currentCount = currentData?.count || 0;
          const newCount = Math.max(0, currentCount - 1);

          if (newCount === 0) {
            const activeRef = ref(rtdb, `rooms/${currentInstance.id}/activeUsers/${user.id}`);
            const usersRef = ref(rtdb, `rooms/${currentInstance.id}/users/${user.id}`);
            remove(activeRef);
            remove(usersRef);

            // Also remove from PublicRooms if this is a public room
            if (currentInstance.type === "public") {
              removeUserFromPublicRoom(currentInstance.id, user.id);
            }

            return null;
          } else {
            return {
              count: newCount,
              displayName: user.displayName,
              lastUpdated: Date.now(),
            };
          }
        });

        // PublicRoom cleanup is now handled by presence system
      }

      off(tabCountRef, "value", handle);
    };
  }, [currentInstance, user, publicRoomId, privateRoomId]);

  // Clean up room presence when leaving
  useEffect(() => {
    if (!publicRoomPresence && !privateRoomPresence) return;

    // Add beforeunload handler for immediate cleanup
    const handleBeforeUnload = () => {
      // Can't use async in beforeunload, so we'll do a sync cleanup attempt
      if (publicRoomPresence) {
        // Use navigator.sendBeacon to make a cleanup request
        // For now, we'll rely on the cleanup effect and onDisconnect
      }
      if (privateRoomPresence) {
        // Use navigator.sendBeacon to make a cleanup request
        // For now, we'll rely on the cleanup effect and onDisconnect
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (publicRoomPresence) {
        publicRoomPresence.leave();
      }
      if (privateRoomPresence) {
        privateRoomPresence.leave();
      }
    };
  }, [publicRoomPresence, privateRoomPresence]);

  // Track active user status in Firebase RTDB
  const handleActiveChange = (isActive: boolean) => {
    if (!currentInstance || !user) return;
    const activeRef = ref(rtdb, `rooms/${currentInstance.id}/activeUsers/${user.id}`);
    setTimerRunning(isActive);
    if (isActive) {
      set(activeRef, { id: user.id, displayName: user.displayName });
      // NOTE: Removed onDisconnect handlers - they conflict with our tab counting system
      // We rely entirely on manual tab counting via beforeunload and useEffect cleanup
      dispatch(lockInput());
      dispatch(setHasStartedRedux(true));
    } else {
      // Always remove from activeUsers when timer is paused/stopped
      remove(activeRef);
      // Don't change lock state here - let complete/clear/quit handle unlocking
    }
  };

  // Helper to format time as mm:ss or hh:mm:ss based on duration
  function formatTime(s: number) {
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
  }

  // Tab title management and timer seconds tracking - update every second when timer is running
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (timerRunning) {
      const updateTitleAndSeconds = () => {
        if (isPomodoroMode) {
          // For Pomodoro, show remaining time in title
          document.title = formatTime(pomodoroRemainingRef.current);
        } else {
          // For Timer, show elapsed time
          document.title = formatTime(timerSecondsRef.current);
        }
        setCurrentTimerSeconds(timerSecondsRef.current);
      };
      interval = setInterval(updateTitleAndSeconds, 1000);
      updateTitleAndSeconds(); // Set immediately
    } else {
      document.title = "Locked In";
      // When timer is not running, still update currentTimerSeconds to show accumulated time
      setCurrentTimerSeconds(timerSecondsRef.current);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerRunning, isPomodoroMode]);

  // Sync timer seconds periodically to ensure TaskList shows correct time
  // This is especially important on page load when timer state is restored
  useEffect(() => {
    // Initial sync
    setCurrentTimerSeconds(timerSecondsRef.current);

    // Set up periodic sync to catch any updates
    const syncInterval = setInterval(() => {
      setCurrentTimerSeconds(timerSecondsRef.current);
    }, 100); // Check every 100ms

    return () => clearInterval(syncInterval);
  }, []);

  // Check TaskBuffer for active tasks on mount
  useEffect(() => {
    if (!user?.id) return;

    const checkTaskBuffer = async () => {
      const userTasksRef = ref(rtdb, `TaskBuffer/${user.id}`);
      try {
        const snapshot = await get(userTasksRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          // Check if there are any task entries (excluding timer_state, heartbeat, etc.)
          const taskIds = Object.keys(data).filter(
            (key) =>
              key !== "timer_state" &&
              key !== "heartbeat" &&
              key !== "tasks" &&
              key !== "rooms" &&
              key !== "completionHistory" &&
              key !== "lastStartSound" &&
              key !== "lastCompleteSound" &&
              key !== "history" &&
              key !== "lastEvent"
          );
          setHasTaskInBuffer(taskIds.length > 0);
        } else {
          setHasTaskInBuffer(false);
        }
      } catch {
        setHasTaskInBuffer(false);
      }
    };

    checkTaskBuffer();

    // Also set up a listener for real-time updates
    const userTasksRef = ref(rtdb, `TaskBuffer/${user.id}`);
    const unsubscribe = onValue(userTasksRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const taskIds = Object.keys(data).filter(
          (key) =>
            key !== "timer_state" &&
            key !== "heartbeat" &&
            key !== "tasks" &&
            key !== "rooms" &&
            key !== "completionHistory" &&
            key !== "lastStartSound" &&
            key !== "lastCompleteSound" &&
            key !== "history" &&
            key !== "lastEvent"
        );
        setHasTaskInBuffer(taskIds.length > 0);
      } else {
        setHasTaskInBuffer(false);
      }
    });

    return () => {
      off(userTasksRef, "value", unsubscribe);
    };
  }, [user?.id]);

  // Listen for event notifications (🥊🏆💀) from GlobalEffects
  useEffect(() => {
    if (!currentInstance) return;
    // Only fetch recent events to avoid processing old ones
    const eventsQuery = query(
      ref(rtdb, `GlobalEffects/${currentInstance.id}/events`),
      orderByChild("timestamp"),
      limitToLast(20) // Only fetch the 20 most recent events
    );
    let timeout: NodeJS.Timeout | null = null;
    const processedEvents = new Set<string>();
    let isInitialLoad = true;

    const handle = onValue(eventsQuery, (snap) => {
      const events = snap.val();
      if (!events) return;

      // On initial load, mark all existing events as processed to ignore them
      if (isInitialLoad) {
        Object.keys(events).forEach((eventId) => processedEvents.add(eventId));
        isInitialLoad = false;
        return;
      }

      // Find new events we haven't processed yet
      Object.entries(events as Record<string, { displayName?: string; type?: string }>).forEach(([eventId, event]) => {
        if (!processedEvents.has(eventId)) {
          processedEvents.add(eventId);

          // Show notification in title
          if (event.displayName && event.type) {
            let emoji = "";
            if (event.type === "start") emoji = "🥊";
            if (event.type === "complete") emoji = "🏆";
            if (event.type === "quit") emoji = "💀";
            document.title = `${emoji} ${event.displayName}`;

            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
              // Resume timer or default title immediately after notification
              if (timerRunning) {
                document.title = formatTime(timerSecondsRef.current);
              } else {
                document.title = "Locked In";
              }
            }, 5000);
          }
        }
      });
    });

    // Clean up old processed events periodically
    const cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - 60000; // 1 minute old
      processedEvents.forEach((eventId) => {
        // Event IDs are in format: userId-type-timestamp
        const parts = eventId.split("-");
        if (parts.length >= 3) {
          const timestamp = parseInt(parts[parts.length - 1]);
          if (!isNaN(timestamp) && timestamp < cutoff) {
            processedEvents.delete(eventId);
          }
        }
      });
    }, 30000); // Run cleanup every 30 seconds

    return () => {
      off(eventsQuery, "value", handle);
      if (timeout) clearTimeout(timeout);
      clearInterval(cleanupInterval);
    };
  }, [currentInstance, timerRunning]);

  // Listen for flying messages from GlobalEffects
  useEffect(() => {
    if (!currentInstance) return;

    const flyingMessagesRef = ref(rtdb, `GlobalEffects/${currentInstance.id}/flyingMessages`);
    const handle = onValue(flyingMessagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Convert Firebase object to array and sort by timestamp
        const messages = Object.entries(data).map(([id, msg]) => {
          const typedMsg = msg as { text: string; color: string; userId: string; timestamp: number };
          return {
            id,
            text: typedMsg.text,
            color: typedMsg.color,
            userId: typedMsg.userId,
            timestamp: typedMsg.timestamp,
          };
        });

        // Filter out messages older than 7 seconds
        const recentMessages = messages.filter((msg) => Date.now() - msg.timestamp < 7000);

        setFlyingMessages(recentMessages);
      } else {
        setFlyingMessages([]);
      }
    });

    return () => off(flyingMessagesRef, "value", handle);
  }, [currentInstance]);

  // Listen for history updates from other users
  useEffect(() => {
    if (!currentInstance) return;

    const historyUpdateRef = ref(rtdb, `rooms/${currentInstance.id}/historyUpdate`);
    let lastTimestamp = 0;

    const handle = onValue(historyUpdateRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.timestamp) {
        // Only fetch if this is a new update (not the same timestamp we already processed)
        if (data.timestamp > lastTimestamp && Date.now() - data.timestamp < 10000) {
          lastTimestamp = data.timestamp;

          // Extract slug from URL since that's what the API expects
          const pathParts = window.location.pathname.split("/");
          const urlSlug = pathParts[pathParts.length - 1];

          if (urlSlug) {
            dispatch(fetchHistory(urlSlug));
          }

          // Also refresh the leaderboard
          dispatch(refreshLeaderboard());
        }
      }
    });

    return () => off(historyUpdateRef, "value", handle);
  }, [currentInstance, dispatch]);

  const handleClearButton = () => {
    // Store the current seconds before resetting
    const currentSeconds = timerSecondsRef.current;

    // Reset the timer seconds ref BEFORE clearing to ensure Pomodoro remounts with 0
    timerSecondsRef.current = 0;

    handleClear({
      timerSeconds: currentSeconds, // Use the stored value for clear logic
      task,
      setShowQuitModal,
      setTimerRunning,
      setTask: () => dispatch(resetInput()),
      setTimerResetKey,
      setInputLocked: (locked: boolean) => dispatch(locked ? lockInput() : unlockInput()),
      setHasStarted: (started: boolean) => dispatch(setHasStartedRedux(started)),
      closeAllModals,
    });
  };

  const handleQuitButton = async () => {
    // Store the current seconds before resetting
    const currentSeconds = timerSecondsRef.current;

    // PRIORITY: Pause the timer first to clear heartbeat interval
    if (timerPauseRef.current && timerRunning) {
      timerPauseRef.current();
    }

    // Reset the timer seconds ref BEFORE quitting to ensure Pomodoro remounts with 0
    timerSecondsRef.current = 0;

    await handleQuitConfirm({
      timerSeconds: currentSeconds, // Use the stored value for quit logging
      task,
      localVolume,
      setTimerRunning,
      setTask: () => dispatch(resetInput()),
      setTimerResetKey,
      setInputLocked: (locked: boolean) => dispatch(locked ? lockInput() : unlockInput()),
      setHasStarted: (started: boolean) => dispatch(setHasStartedRedux(started)),
      setShowQuitModal,
    });
  };

  const handlePushOnButton = () => {
    handlePushOn(setShowQuitModal);
  };

  // Complete handler: reset timer, clear input, set inactive
  const handleComplete = (duration: string) => {
    setTimerRunning(false);
    // Reset the timer seconds ref BEFORE triggering reset to ensure Pomodoro remounts with 0
    timerSecondsRef.current = 0;
    setTimerResetKey((k) => k + 1);
    // Clear Firebase timer state when completing
    if (currentInstance && user?.id) {
      // Timer state is part of task - gets removed when task is removed
    }
    if (currentInstance && user) {
      const activeRef = ref(rtdb, `rooms/${currentInstance.id}/activeUsers/${user.id}`);
      remove(activeRef);
      // Save to history
      const historyRef = ref(rtdb, `rooms/${currentInstance.id}/history`);
      const completionData = {
        userId: user.id,
        displayName: user.displayName,
        task,
        duration,
        timestamp: Date.now(),
        completed: true,
      };
      push(historyRef, completionData);

      // Completion history should be stored elsewhere, not in TaskBuffer
      // TaskBuffer is only for temporary task data during active work

      // Trigger global task completed event for PersonalStats
      if (typeof window !== "undefined") {
        const windowWithTask = window as Window & { addCompletedTask?: (task: typeof completionData) => void };
        if (windowWithTask.addCompletedTask) {
          windowWithTask.addCompletedTask(completionData);
        }
      }

      // notifyEvent is now handled by Timer component conditionally based on duration
      // Add flying message to GlobalEffects
      const flyingMessageId = `${user.id}-complete-${Date.now()}`;
      const flyingMessageRef = ref(rtdb, `GlobalEffects/${currentInstance.id}/flyingMessages/${flyingMessageId}`);
      set(flyingMessageRef, {
        text: `🏆 ${user.displayName} has successfully completed a task!`,
        color: "text-green-400",
        userId: user.id,
        timestamp: Date.now(),
      });

      // Auto-remove the message after 7 seconds
      setTimeout(() => {
        remove(flyingMessageRef);
      }, 7000);
    }

    // Reset input immediately
    dispatch(resetInput());

    // Also reset after a small delay to ensure it overrides any restoration attempts
    setTimeout(() => {
      dispatch(resetInput());
    }, 100);
  };

  // Handle click outside for timer dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timerDropdownRef.current && !timerDropdownRef.current.contains(event.target as Node)) {
        setShowTimerDropdown(false);
      }
    };

    if (showTimerDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showTimerDropdown]);

  // Add keyboard shortcuts for toggling TaskList and Notes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Escape key to close all modals
      if (e.key === "Escape") {
        e.preventDefault();
        closeAllModals();
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const isModifierPressed = isMac ? e.metaKey : e.ctrlKey;

      if (!isModifierPressed) return;

      const key = e.key.toLowerCase();

      // Cmd/Ctrl+K: Toggle TaskList
      if (key === "k") {
        e.preventDefault();
        const wasOpen = showTaskList;
        closeAllModals();
        setShowTaskList(!wasOpen);
      }
      // Cmd/Ctrl+J: Toggle Notes (only if task exists)
      else if (key === "j") {
        if (task.trim()) {
          e.preventDefault();
          const wasOpen = showNotes;
          closeAllModals();
          setShowNotes(!wasOpen);
        }
      }
      // Cmd/Ctrl+M: Toggle Mute
      else if (key === "m") {
        e.preventDefault();
        if (localVolume === 0) {
          // Unmute: restore previous volume
          setLocalVolume(previousVolume);
        } else {
          // Mute: save current volume and set to 0
          setPreviousVolume(localVolume);
          setLocalVolume(0);
        }
      }
      // Cmd/Ctrl+H: Toggle History (only in private rooms)
      else if (key === "h") {
        e.preventDefault();
        if (currentInstance?.type === "private") {
          const wasOpen = showHistory;
          closeAllModals();
          setShowHistory(!wasOpen);
        }
      }
      // Cmd/Ctrl+L: Toggle Leaderboard
      else if (key === "l") {
        e.preventDefault();
        const wasOpen = showLeaderboard;
        closeAllModals();
        setShowLeaderboard(!wasOpen);
      }
      // Cmd/Ctrl+S: Toggle Analytics
      else if (key === "s") {
        e.preventDefault();
        const wasOpen = showAnalytics;
        closeAllModals();
        setShowAnalytics(!wasOpen);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    task,
    localVolume,
    previousVolume,
    currentInstance?.type,
    showTaskList,
    showNotes,
    showHistory,
    showLeaderboard,
    showAnalytics,
    closeAllModals,
  ]);

  if (!userReady || !user.id || user.id.startsWith("user-")) {
    // Not signed in: mask everything with SignIn
    return (
      <div className="min-h-screen flex items-center justify-center bg-elegant-dark text-white">
        <div className="flex flex-col items-center justify-center w-full h-full">
          <div className="w-full flex flex-col items-center mb-10 mt-2">
            <h1 className="text-4xl md:text-5xl font-extrabold text-white text-center mb-2 drop-shadow-lg">
              Drop Lock In. Get Sh<span style={{ color: "#FFAA00" }}>*</span>t Done.
            </h1>
            <p className="text-lg md:text-2xl text-gray-300 text-center max-w-2xl mx-auto opacity-90 font-medium">
              Level up your work with others in the zone.
            </p>
          </div>

          {/* Room access message */}
          <div className="bg-gray-900/50 rounded-xl px-6 py-4 mb-8 border border-gray-800 max-w-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#FFAA00]/20 rounded-full flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#FFAA00]">
                  <path
                    d="M16 12V8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8V12M19 21H5C4.44772 21 4 20.5523 4 20V13C4 12.4477 4.44772 12 5 12H19C19.5523 12 20 12.4477 20 13V20C20 20.5523 19.5523 21 19 21Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="text-gray-300">
                <p className="font-semibold text-white">Sign in required</p>
                <p className="text-sm">You need to be signed in to access this room</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <button
              onClick={() => signInWithGoogle()}
              className="w-full max-w-xs flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-3 px-6 bg-white text-gray-900 text-lg font-medium shadow-sm hover:border-[#FFAA00] transition"
            >
              <Image src="/google.png" alt="Google" width={24} height={24} className="mr-2" />
              Continue with Google
            </button>
            <div className="mt-4 text-gray-300 text-base">
              Don&apos;t have an account?{" "}
              <button
                className="font-bold underline underline-offset-2 hover:text-[#FFAA00] transition"
                onClick={() => setShowSignInModal(true)}
              >
                Sign up
              </button>
            </div>
          </div>
          {showSignInModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
              onClick={() => setShowSignInModal(false)}
            >
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <SignIn />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-elegant-dark">
        <DotSpinner size="40" speed="0.9" color="#FFAA00" />
      </div>
    );
  }
  if (!roomFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-elegant-dark text-white">
        <div className="bg-gray-900/90 rounded-2xl shadow-2xl p-10 w-full max-w-lg flex flex-col items-center gap-8 border-4 border-yellow-500">
          <p className="text-2xl font-bold text-red-400">Room not found.</p>
          <button
            className="bg-yellow-500 text-black px-6 py-2 rounded-full font-bold hover:bg-yellow-400 transition"
            onClick={() => router.push("/")}
          >
            Go to Lobby
          </button>
        </div>
      </div>
    );
  }
  if (currentInstance) {
    return (
      <>
        {/* Active work border overlay */}
        {timerRunning && <div className="fixed inset-0 border-4 border-[#FFAA00] pointer-events-none z-50"></div>}
        <div className="min-h-screen flex flex-col items-center justify-center bg-elegant-dark text-white relative">
          {/* Top right container for controls */}
          <div className="fixed top-[8px] right-4 z-50 flex items-center gap-2 max-w-[calc(100vw-6rem)]">
            {/* Controls - speaker icon, timer dropdown, and name dropdown */}
            <Controls
              isPomodoroMode={isPomodoroMode}
              showTimerDropdown={showTimerDropdown}
              setShowTimerDropdown={setShowTimerDropdown}
              timerDropdownRef={timerDropdownRef}
              className=""
              localVolume={localVolume}
              setLocalVolume={setLocalVolume}
              showHistory={showHistory}
              setShowHistory={setShowHistory}
              showHistoryTooltip={showHistoryTooltip}
              setShowHistoryTooltip={setShowHistoryTooltip}
              instanceType={currentInstance.type}
              setShowInviteModal={setShowInviteModal}
              showLeaderboard={showLeaderboard}
              setShowLeaderboard={setShowLeaderboard}
              setShowRoomsModal={setShowRoomsModal}
              setShowPreferences={setShowPreferences}
              showAnalytics={showAnalytics}
              setShowAnalytics={setShowAnalytics}
              closeAllModals={closeAllModals}
            />
          </div>
          {/* Personal stats - bottom center for all screen sizes */}
          <PersonalStats
            onClick={() => {
              closeAllModals();
              setShowAnalytics(true);
            }}
          />
          {/* Tasks - desktop only: bottom right corner */}
          <button
            className={`fixed bottom-4 right-8 z-[60] text-gray-400 text-lg font-mono underline underline-offset-4 select-none hover:text-[#FFAA00] transition-colors px-2 py-1 bg-transparent border-none cursor-pointer hidden sm:flex items-center ${
              showTaskList ? "!hidden" : ""
            }`}
            onClick={() => {
              closeAllModals();
              setShowTaskList(true);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="mr-2">
              <path
                d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Tasks
          </button>
          <FlyingMessages
            flyingMessages={flyingMessages}
            flyingPlaceholders={[]}
            activeWorkers={currentInstance.users.map((u) => ({ name: u.displayName, userId: u.id }))}
          />
          <WelcomeBackMessage roomId={currentInstance.id} />
          <Sounds roomId={currentInstance.id} localVolume={localVolume} currentUserId={user?.id} />
          <ActiveWorkers roomId={currentInstance.id} />
          {/* Main content: TaskInput or Timer/room UI - hidden when welcome message is showing */}
          <div className={showHistory ? "hidden" : "flex flex-col items-center justify-center"}>
            {/* Only show TaskInput when in Timer mode */}
            {!isPomodoroMode && (
              <div className="relative group">
                <TaskInput
                  onStart={() => {
                    // Simply trigger the timer's start button - let it handle all the logic
                    if (timerStartRef.current) {
                      timerStartRef.current();
                    }
                  }}
                  setShowTaskList={setShowTaskList}
                />
                {/* Clear button in top-right: when running (on hover) or when paused (also on hover) */}
                {task.trim() && hasStarted && (
                  <button
                    className={`absolute -top-6 right-0 text-gray-400 text-sm font-mono underline underline-offset-4 select-none hover:text-[#FFAA00] transition-all px-2 py-1 bg-transparent border-none cursor-pointer z-10 opacity-0 group-hover:opacity-100`}
                    onClick={handleClearButton}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
          <div className={showHistory ? "" : "hidden"}>
            <History onClose={() => setShowHistory(false)} />
          </div>
          {/* Timer/Pomodoro is always mounted, just hidden when history is open */}
          <div className={showHistory ? "hidden" : "flex flex-col items-center justify-center"}>
            {/* Notes - inline above timer, only show when task exists */}
            {task.trim() && <Notes isOpen={showNotes} task={task} taskId={currentTaskId} />}

            {/* Conditionally render Timer or Pomodoro based on mode */}
            {!isPomodoroMode ? (
              <Timer
                key={timerResetKey}
                onActiveChange={handleActiveChange}
                startRef={timerStartRef}
                pauseRef={timerPauseRef}
                onComplete={handleComplete}
                secondsRef={timerSecondsRef}
                localVolume={localVolume}
                onTaskRestore={(taskName, isRunning) => {
                  dispatch(setCurrentInput(taskName));
                  if (isRunning) {
                    dispatch(lockInput());
                  }
                  dispatch(setHasStartedRedux(true));
                }}
                onNewTaskStart={() => {
                  lastStartTimeRef.current = Date.now();
                }}
                startCooldown={localStartCooldown}
                lastStartTime={lastStartTimeRef.current}
                initialRunning={timerRunning}
              />
            ) : (
              <Pomodoro
                key={timerResetKey}
                localVolume={localVolume}
                onActiveChange={handleActiveChange}
                onNewTaskStart={() => {
                  lastStartTimeRef.current = Date.now();
                }}
                onComplete={handleComplete}
                startRef={timerStartRef}
                pauseRef={timerPauseRef}
                secondsRef={timerSecondsRef}
                remainingRef={pomodoroRemainingRef}
                lastStartTime={lastStartTimeRef.current}
                initialRunning={timerRunning}
                onClearClick={handleClearButton}
                setShowTaskList={setShowTaskList}
              />
            )}
          </div>

          {/* Analytics and Leaderboard buttons - bottom left */}
          <div className="fixed bottom-4 left-8 z-[60] hidden sm:flex flex-col gap-4">
            {/* Analytics Section */}
            <button
              className="flex items-center gap-3 group relative cursor-pointer"
              onClick={() => {
                closeAllModals();
                setShowAnalytics(true);
              }}
            >
              <div className="relative">
                <div
                  className="w-10 h-10 bg-gray-400 group-hover:bg-[#FFAA00] transition-all duration-300 transform group-hover:scale-110"
                  style={{
                    WebkitMask: `url(/analytics-icon.svg) no-repeat center`,
                    mask: `url(/analytics-icon.svg) no-repeat center`,
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                  }}
                />
                {/* Glow effect on hover */}
                <div className="absolute inset-0 bg-[#FFAA00] opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300 rounded-full"></div>
              </div>
              <span className="text-gray-400 text-sm font-mono cursor-pointer underline underline-offset-4 select-none group-hover:text-[#FFAA00] transition-all duration-300 opacity-0 group-hover:opacity-100 absolute left-12 whitespace-nowrap">
                Analytics
              </span>
            </button>

            {/* Leaderboard Section */}
            <button
              className="flex items-center gap-3 group relative cursor-pointer"
              onClick={() => {
                closeAllModals();
                setShowLeaderboard(true);
              }}
            >
              <div className="relative">
                <div
                  className="w-10 h-10 bg-gray-400 group-hover:bg-[#FFAA00] transition-all duration-300 transform group-hover:scale-110"
                  style={{
                    WebkitMask: `url(/crown-icon.svg) no-repeat center`,
                    mask: `url(/crown-icon.svg) no-repeat center`,
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                  }}
                />
                {/* Glow effect on hover */}
                <div className="absolute inset-0 bg-[#FFAA00] opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300 rounded-full"></div>
              </div>
              <span className="text-gray-400 text-sm font-mono cursor-pointer underline underline-offset-4 select-none group-hover:text-[#FFAA00] transition-all duration-300 opacity-0 group-hover:opacity-100 absolute left-12 whitespace-nowrap">
                Leaderboard
              </span>
            </button>

            {/* History Section */}
            <button
              className="flex items-center gap-3 group relative cursor-pointer"
              onClick={() => {
                closeAllModals();
                setShowHistory(true);
              }}
            >
              <div className="relative">
                <div
                  className="w-10 h-10 bg-gray-400 group-hover:bg-[#FFAA00] transition-all duration-300 transform group-hover:scale-110"
                  style={{
                    WebkitMask: `url(/history-icon.svg) no-repeat center`,
                    mask: `url(/history-icon.svg) no-repeat center`,
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                  }}
                />
                {/* Glow effect on hover */}
                <div className="absolute inset-0 bg-[#FFAA00] opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300 rounded-full"></div>
              </div>
              <span className="text-gray-400 text-sm font-mono cursor-pointer underline underline-offset-4 select-none group-hover:text-[#FFAA00] transition-all duration-300 opacity-0 group-hover:opacity-100 absolute left-12 whitespace-nowrap">
                History
              </span>
            </button>
          </div>
          {showQuitModal && (
            <div className="fixed inset-0 z-50 pointer-events-none animate-in fade-in duration-300">
              {/* Background overlay - dims background while keeping it visible */}
              <div className="absolute inset-0 bg-black/80 pointer-events-auto" />

              {/* Centered popup */}
              <div
                className="absolute inset-0 flex items-center justify-center p-4 pointer-events-auto"
                onClick={() => setShowQuitModal(false)}
              >
                <div
                  className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 max-w-sm w-full animate-in slide-in-from-bottom-4 duration-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-red-400">
                          <path
                            d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-white">Quit Session</h3>
                    </div>
                    <p className="text-gray-300 mb-6">
                      Are you sure you want to quit? This will be logged to your history.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={handlePushOnButton}
                        className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
                      >
                        Push On
                      </button>
                      <button
                        onClick={handleQuitButton}
                        className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
                      >
                        Quit
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {showLeaderboard && currentInstance && <Leaderboard onClose={() => setShowLeaderboard(false)} />}
          {showHistory && currentInstance && <History onClose={() => setShowHistory(false)} />}
          {showAnalytics && currentInstance && user && (
            <Analytics
              roomId={currentInstance.id}
              userId={user.id}
              displayName={user.displayName}
              onClose={() => setShowAnalytics(false)}
            />
          )}
          {showPreferences && <Preferences onClose={() => setShowPreferences(false)} />}
        </div>
        {/* Invite Modal - rendered as separate overlay */}
        {showInviteModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={() => setShowInviteModal(false)}
          >
            <div
              className="bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-800 relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors text-xl"
                onClick={() => setShowInviteModal(false)}
              >
                ×
              </button>

              <h2 className="text-2xl font-bold text-white mb-6">Invite link</h2>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={window.location.href}
                  readOnly
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-800 text-gray-300 border border-gray-700 focus:border-[#FFAA00] outline-none font-mono text-sm"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 3000);
                  }}
                  className={`px-6 py-3 font-bold rounded-lg hover:scale-105 transition-all flex items-center gap-2 ${
                    copied ? "bg-green-500 text-white" : "bg-[#FFAA00] text-white"
                  } w-24 justify-center`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="8" y="8" width="12" height="12" rx="2" ry="2" fill="currentColor"></rect>
                    <rect
                      x="4"
                      y="4"
                      width="12"
                      height="12"
                      rx="2"
                      ry="2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    ></rect>
                  </svg>
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Task List Modal */}
        <TaskList
          isOpen={showTaskList}
          onClose={() => setShowTaskList(false)}
          onStartTask={(taskText) => {
            dispatch(setCurrentInput(taskText));
            setShowTaskList(false);
            // Small delay to ensure task is set before starting timer
            setTimeout(() => {
              if (timerStartRef.current) {
                timerStartRef.current();
              }
            }, 50);
          }}
          isTimerRunning={timerRunning}
          hasActiveTimer={hasActiveTimer}
          onPauseTimer={() => {
            if (timerPauseRef.current) {
              timerPauseRef.current();
            }
          }}
          timerSeconds={currentTimerSeconds}
        />

        {/* Rooms Modal */}
        <RoomsModal isOpen={showRoomsModal} onClose={() => setShowRoomsModal(false)} />
      </>
    );
  }
  return null;
}
