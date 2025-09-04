"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useInstance } from "../Instances";
import { useRouter } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { setActiveTask, updateTaskCounterLocal, updateTaskCounter } from "../../store/taskSlice";
import { setPreference, updatePreferences } from "../../store/preferenceSlice";
import { setValue as setCounterValue } from "../../store/counterSlice";
import LocalCounterCache from "@/app/utils/localCounterCache";
import { rtdb } from "../../../lib/firebase";
import type { Instance } from "../../types";
import {
  ref,
  onValue,
  off,
  remove,
  runTransaction,
  get,
  set,
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
// import Contacts from "./Contacts"; // People Modal - Feature deprioritized
import WorkSpace from "./WorkSpace";
import Controls from "./Controls";
import FlyingMessages from "./FlyingMessages";
import Leaderboard from "./Leaderboard";
import Sounds from "./Sounds";
import TaskList from "./TaskList";
import PersonalStats from "./PersonalStats";
import WelcomeBackMessage from "./WelcomeBackMessage";
import RoomsModal from "./RoomsModal";
import Notes from "./Notes";
import TaskNotes from "./TaskNotes";
import Preferences from "./Preferences";
import InvitePopup from "./InvitePopup";
import MobileMenu from "./MobileMenu";
import { getPublicRoomByUrl, addUserToPublicRoom, removeUserFromPublicRoom } from "@/app/utils/publicRooms";
import { PresenceService } from "@/app/utils/presenceService";
import { DotSpinner } from "ldrs/react";
import "ldrs/react/DotSpinner.css";
import { startCleanupScheduler } from "@/app/utils/cleanupScheduler";
import { getPrivateRoomByUrl, addUserToPrivateRoom, removeUserFromPrivateRoom } from "@/app/utils/privateRooms";
import { useClearButton } from "@/app/hooks/ClearButton";
import { useQuitButton } from "@/app/hooks/QuitButton";
import {
  resetInput,
  lockInput,
  unlockInput,
  setHasStarted as setHasStartedRedux,
  setCurrentInput,
  setCurrentTask,
} from "@/app/store/taskInputSlice";

type MilestoneData = {
  milestone: string;
  stats: {
    totalTasks: number;
    totalHours: number;
    totalDuration: number;
  };
};


export default function RoomShell({ roomUrl }: { roomUrl: string }) {
  const { currentInstance, user, userReady, setPublicRoomInstance } = useInstance();
  const [loading, setLoading] = useState(true);
  const [roomFound, setRoomFound] = useState(false);
  const [publicRoomId, setPublicRoomId] = useState<string | null>(null);
  const [roomPresence, setRoomPresence] = useState<PresenceService | null>(null);
  const [privateRoomId, setPrivateRoomId] = useState<string | null>(null);
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  // Get user data from Redux store
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);
  const { currentInput: task = "" } = useSelector((state: RootState) => state.taskInput);
  const { hasStarted } = useSelector((state: RootState) => state.taskInput);
  const reduxUser = useSelector((state: RootState) => state.user);
  const [timerResetKey, setTimerResetKey] = useState(0);
  const timerStartRef = React.useRef<() => void>(null!);
  const timerPauseRef = React.useRef<() => void>(null!);
  const [showHistory, setShowHistory] = useState(false);
  const timerSecondsRef = React.useRef<number>(0);
  const pomodoroRemainingRef = React.useRef<number>(0);
  const isQuittingRef = React.useRef<boolean>(false);
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
  // const [showContacts, setShowContacts] = useState(false); // People Modal - Feature deprioritized
  const [showRooms, setShowRooms] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState<"available" | "dnd" | "offline">("available");
  const [showTaskList, setShowTaskList] = useState(false);
  const [showRoomsModal, setShowRoomsModal] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);
  // Sign-in modal removed - guests can now access rooms
  const [showInvitePopup, setShowInvitePopup] = useState(false);
  // Get toggle_notes from Redux preferences instead of local state
  const showDeepWorkNotes = useSelector((state: RootState) => state.preferences.toggle_notes);
  const showCounter = useSelector((state: RootState) => state.preferences.toggle_counter);
  const activeTask = useSelector((state: RootState) => 
    state.tasks.tasks.find(t => t.id === state.tasks.activeTaskId)
  );
  // For guest users, use per-task cached counter; for authenticated users, use task counter
  // Treat undefined isGuest as guest mode (safer default)
  const reduxCounterValue = useSelector((state: RootState) => state.counter.value);
  const isGuestUser = reduxUser.isGuest !== false; // true or undefined = guest mode
  
  // Load counter from cache when task changes (for guests)
  useEffect(() => {
    if (isGuestUser && activeTask?.id) {
      const cachedValue = LocalCounterCache.getCounter(activeTask.id);
      dispatch(setCounterValue(cachedValue));
    }
  }, [isGuestUser, activeTask?.id, dispatch]);
  
  const counterValue = isGuestUser ? reduxCounterValue : (activeTask?.counter || 0);
  
  const counterUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isEditingCounter, setIsEditingCounter] = useState(false);
  const [editingCounterValue, setEditingCounterValue] = useState("");
  
  // Sync counter value when active task changes (only for authenticated users)
  useEffect(() => {
    if (!isGuestUser) {
      // For authenticated users, sync from task counter to Redux
      dispatch(setCounterValue(counterValue));
    }
    // For guest users, the counter value is already in Redux and cached
  }, [counterValue, dispatch, isGuestUser]);
  
  // Debounced function to update counter in database
  const updateCounterInDatabase = useCallback((taskId: string, newValue: number) => {
    // For guest users, just save to cache
    if (isGuestUser) {
      LocalCounterCache.saveCounter(taskId, newValue);
      return;
    }
    
    // Clear any pending update
    if (counterUpdateTimeoutRef.current) {
      clearTimeout(counterUpdateTimeoutRef.current);
    }
    
    // Set a new timeout for the database update
    counterUpdateTimeoutRef.current = setTimeout(() => {
      const token = localStorage.getItem("firebase_token");
      if (token) {
        dispatch(updateTaskCounter({ 
          taskId, 
          counter: newValue, 
          token 
        }));
      }
    }, 500); // 500ms debounce
  }, [dispatch, isGuestUser]);
  
  // Cleanup counter update timeout on unmount
  useEffect(() => {
    return () => {
      if (counterUpdateTimeoutRef.current) {
        clearTimeout(counterUpdateTimeoutRef.current);
      }
    };
  }, []);
  // People Modal - Feature deprioritized
  // const [messagesNotificationCount, setMessagesNotificationCount] = useState(1);
  // const [requestsNotificationCount, setRequestsNotificationCount] = useState(3);
  // const peopleNotificationCount = messagesNotificationCount + requestsNotificationCount;
  // const setPeopleNotificationCount = () => {}; // No longer needed, calculated automatically
  // Get mode preference from Redux
  const preferences = useSelector((state: RootState) => state.preferences);
  const isPomodoroMode = preferences.mode === "countdown";
  const [showTimerDropdown, setShowTimerDropdown] = useState(false);
  const timerDropdownRef = useRef<HTMLDivElement>(null);

  // Use button hooks
  const { handleClear } = useClearButton();
  const { handleQuitConfirm, handlePushOn } = useQuitButton();

  const [localVolume, setLocalVolumeState] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("lockedin_volume");
      if (stored !== null) return Number(stored);
    }
    return 0.2;
  });

  // Track previous volume for mute/unmute functionality
  const [previousVolume, setPreviousVolume] = useState(0.2);
  
  // Wrap setLocalVolume to also update active audio
  const setLocalVolume = useCallback((volume: number) => {
    setLocalVolumeState(volume);
    // Update all active audio elements immediately
    import('../../utils/activeAudio').then(({ updateAllVolumes }) => {
      updateAllVolumes(volume);
    });
  }, []);

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
    // setShowContacts(false); // People Modal - Feature deprioritized
    setShowRooms(false);
    setShowQuitModal(false);
    // setShowSignInModal(false); // Not defined - removed
    setShowTimerDropdown(false);
    setShowInvitePopup(false);
  }, []);

  // Track if there's an active timer state from Redux or TaskBuffer
  const [hasTaskInBuffer, setHasTaskInBuffer] = useState(false);
  const hasActiveTimer = Boolean(activeTaskId) || hasTaskInBuffer;
  const [currentTimerSeconds, setCurrentTimerSeconds] = useState(0);

  // Check for active timer state on mount and lock input immediately
  useEffect(() => {
    if (user?.id) {
      // First check for LastTask
      const lastTaskRef = ref(rtdb, `TaskBuffer/${user.id}/LastTask`);
      get(lastTaskRef).then(async (lastTaskSnapshot) => {
        if (lastTaskSnapshot.exists()) {
          const lastTaskData = lastTaskSnapshot.val();
          
          // Check if this task exists in TaskBuffer
          const taskRef = ref(rtdb, `TaskBuffer/${user.id}/${lastTaskData.taskId}`);
          const taskSnapshot = await get(taskRef);
          
          if (taskSnapshot.exists()) {
            const taskData = taskSnapshot.val();
            
            // Set the task input and active task
            dispatch(setCurrentInput(lastTaskData.taskName || taskData.name));
            dispatch(setCurrentTask({ id: lastTaskData.taskId, name: lastTaskData.taskName || taskData.name }));
            dispatch(setActiveTask(lastTaskData.taskId));
            dispatch(setHasStartedRedux(true));
            
            // Don't check timer_state since we found LastTask
            return;
          }
        }
        
        // If no LastTask, check timer_state for backward compatibility
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
      }).catch(() => {
        // Silent error handling - LastTask may not exist
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

  // Listen for milestone invite popup events
  useEffect(() => {
    const handleMilestoneInvite = (event: CustomEvent) => {
      const { milestone, stats } = event.detail;
      setShowInvitePopup(true);
      // Store milestone data for the popup
      (window as Window & { milestoneData?: MilestoneData }).milestoneData = { milestone, stats };
    };

    window.addEventListener("showMilestoneInvite", handleMilestoneInvite as EventListener);
    return () => {
      window.removeEventListener("showMilestoneInvite", handleMilestoneInvite as EventListener);
    };
  }, []);

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
          if (!roomPresence) {
            console.log("[RoomShell] Initializing presence for user:", {
              userId: user.id,
              roomId: currentInstance.id,
              reduxUserId: reduxUser.user_id,
              reduxAuthId: reduxUser.auth_id,
              isGuest: reduxUser.isGuest
            });
            const presence = new PresenceService(user.id, currentInstance.id);
            const initialized = await presence.initialize();
            if (initialized) {
              setRoomPresence(presence);

              // Add user to PublicRoom users list and update count
              await addUserToPublicRoom(currentInstance.id, user.id, user.displayName);

              // Start cleanup scheduler to ensure orphaned rooms are cleaned
              startCleanupScheduler();
            }
          }
        }
        return;
      }

      // Check PublicRooms first
      try {
        const publicRoom = await getPublicRoomByUrl(roomUrl);
        if (publicRoom) {
          // Only join if we're not already in this room
          if (!publicRoomId || publicRoomId !== publicRoom.id) {
            // Create presence manager
            const presence = new PresenceService(user.id, publicRoom.id);
            const initialized = await presence.initialize();

            if (!initialized) {
              // Failed to initialize presence
              setRoomFound(false);
              setLoading(false);
              return;
            }

            // Store presence manager
            setRoomPresence(presence);

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
            try {
              // Check if the user is the superadmin
              const SUPERADMIN_USER_ID = "df3aed2a-ad51-457f-b0cd-f7d4225143d4";
              const isSuperadmin = reduxUser.user_id === SUPERADMIN_USER_ID;
              
              // Check if user is a member of this private room (for superadmin visibility logic)
              let isMember = true; // Default to true for non-superadmin users
              if (isSuperadmin) {
                try {
                  const membershipResponse = await fetch(
                    `/api/check-room-membership?userId=${reduxUser.user_id}&roomSlug=${roomUrl}`
                  );
                  if (membershipResponse.ok) {
                    const membershipData = await membershipResponse.json();
                    isMember = membershipData.isMember;
                  }
                } catch (error) {
                  console.error("Failed to check room membership:", error);
                }
              }
              
              // Create presence manager for private rooms
              const presence = new PresenceService(user.id, privateRoom.id);
              const initialized = await presence.initialize();
              
              if (initialized) {
                // Store presence manager
                setRoomPresence(presence);

                // Only add user to PrivateRoom users list if they're not superadmin OR if they're a member
                // This prevents superadmin from appearing in the room unless they're actually a member
                if (!isSuperadmin || isMember) {
                  await addUserToPrivateRoom(privateRoom.id, user.id, user.displayName);
                }
                
                // Store the private room ID for cleanup later
                setPrivateRoomId(privateRoom.id);
              }
            } catch {
              setRoomFound(false);
              setLoading(false);
              return;
            }

          }

          setRoomFound(true);

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

      // Check permanent public rooms in PostgreSQL
      try {
        const roomResponse = await fetch(`/api/room/by-slug?slug=${roomUrl}`);
        const roomResult = await roomResponse.json();
        
        if (roomResult.success && roomResult.room) {
          // Found a permanent public room
          setRoomFound(true);
          
          // Initialize presence for permanent public rooms
          const presence = new PresenceService(user.id, roomResult.room.id);
          const initialized = await presence.initialize();
          
          if (initialized) {
            setRoomPresence(presence);
          }
          
          // Create a temporary Instance object for compatibility
          const tempInstance: Instance = {
            id: roomResult.room.id,
            type: "public",
            users: [user],
            createdBy: user.id, // We don't know the actual creator
            url: roomUrl,
          };
          
          // Set this as the current instance
          setPublicRoomInstance(tempInstance);
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error("Error checking permanent room:", error);
      }

      setRoomFound(false);
      setLoading(false);
    };

    if (userReady) {
      let cancelled = false;
      
      // Small delay to ensure Firebase writes are propagated
      const timer = setTimeout(() => {
        if (!cancelled) {
          checkRoom();
        }
      }, 100);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
  }, [
    roomUrl,
    currentInstance,
    userReady,
    reduxUser.user_id,
    reduxUser.auth_id,
    reduxUser.isGuest,
    publicRoomId,
    privateRoomId,
    setPublicRoomInstance,
    user,
    roomPresence,
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

          // Also remove from PublicRooms if this is a public room
          if (currentInstance.type === "public" && publicRoomId) {
            removeUserFromPublicRoom(publicRoomId, user.id);
          }

          // Also remove from PrivateRooms if this is a private room
          // The removeUserFromPrivateRoom function will handle it gracefully if user wasn't in the room
          // (superadmin viewing without membership won't be in the room, so removal will be a no-op)
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
    if (!roomPresence) return;

    // Add beforeunload handler for immediate cleanup
    const handleBeforeUnload = () => {
      // Can't use async in beforeunload, so we'll do a sync cleanup attempt
      // The PresenceService has onDisconnect handlers that will clean up
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (roomPresence) {
                roomPresence.cleanup();
      }
    };
  }, [roomPresence, user?.id]); // Also cleanup if user ID changes

  // Track active user status
  const handleActiveChange = (isActive: boolean) => {
    if (!currentInstance || !user) return;
    setTimerRunning(isActive);
    
    // Update presence service - this handles all presence tracking now
    if (roomPresence) {
      roomPresence.setActive(isActive);
    }
    
    if (isActive) {
      dispatch(lockInput());
      dispatch(setHasStartedRedux(true));
    } else {
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
        // Defer state update to avoid updating during render
        queueMicrotask(() => {
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
        });
      } catch {
        queueMicrotask(() => {
          setHasTaskInBuffer(false);
        });
      }
    };

    checkTaskBuffer();

    // Also set up a listener for real-time updates
    const userTasksRef = ref(rtdb, `TaskBuffer/${user.id}`);
    const unsubscribe = onValue(userTasksRef, (snapshot) => {
      // Defer state update to avoid updating during render
      queueMicrotask(() => {
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
      Object.entries(events as Record<string, { displayName?: string; firstName?: string; lastName?: string; type?: string; userId?: string; authId?: string; duration?: number }>).forEach(async ([eventId, event]) => {
        if (!processedEvents.has(eventId)) {
          processedEvents.add(eventId);

          // Show notification in title
          if (event.type && event.userId) {
            let emoji = "";
            if (event.type === "start") emoji = "🥊";
            if (event.type === "complete") emoji = "🏆";
            if (event.type === "quit") emoji = "💀";
            
            // Use the name directly from the event data (already has correct user's firstName/lastName)
            let name = "Someone";
            if (event.firstName || event.lastName) {
              name = `${event.firstName || ''} ${event.lastName || ''}`.trim();
            } else if (event.displayName) {
              name = event.displayName;
            }
            
            // Update browser title to show action and name
            // This will be seen by ALL users in the room
            if (event.type === "start") {
              document.title = `${emoji} ${name} started`;
            } else if (event.type === "complete") {
              document.title = `${emoji} ${name} completed`;
            } else if (event.type === "quit") {
              document.title = `${emoji} ${name} quit`;
            } else {
              document.title = `${emoji} ${name}`;
            }

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

  // History updates are now handled through polling or manual refresh
  // Users will see updates when they next load the history modal

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
      setInputLocked: (locked: boolean) => dispatch(locked ? lockInput() : unlockInput()),
      setHasStarted: (started: boolean) => dispatch(setHasStartedRedux(started)),
      closeAllModals,
    });
  };

  const handleQuitButton = async () => {
    // Store the current seconds before resetting
    let currentSeconds = timerSecondsRef.current;
    
    // If timer shows 0 but we have an active task, get the time from the task
    if (currentSeconds === 0 && activeTaskId) {
      const activeTask = reduxTasks.find(t => t.id === activeTaskId);
      if (activeTask && activeTask.timeSpent > 0) {
        currentSeconds = activeTask.timeSpent;
      }
    }

    // Set the quit flag to prevent any saves during quit
    isQuittingRef.current = true;

    // Reset the timer seconds ref BEFORE quitting to ensure Pomodoro remounts with 0
    timerSecondsRef.current = 0;

    await handleQuitConfirm({
      timerSeconds: currentSeconds, // Use the stored value for quit logging
      task,
      localVolume,
      setTimerRunning,
      setTask: () => dispatch(resetInput()),
      setInputLocked: (locked: boolean) => dispatch(locked ? lockInput() : unlockInput()),
      setHasStarted: (started: boolean) => dispatch(setHasStartedRedux(started)),
      setShowQuitModal,
    });
    
    // Reset the quit flag after quit is complete
    isQuittingRef.current = false;
    
    // Ensure input is unlocked after a small delay (in case Timer state hasn't updated yet)
    setTimeout(() => {
      dispatch(unlockInput());
    }, 100);
  };

  const handlePushOnButton = () => {
    handlePushOn(setShowQuitModal);
  };

  // Complete handler: reset timer, clear input, set inactive
  const handleComplete = async (duration: string) => {
    setTimerRunning(false);
    // Reset the timer seconds ref BEFORE triggering reset to ensure Pomodoro remounts with 0
    timerSecondsRef.current = 0;
    setTimerResetKey((k) => k + 1);
    // Clear Firebase timer state when completing
    if (currentInstance && user?.id) {
      // Timer state is part of task - gets removed when task is removed
    }
    if (currentInstance && user) {
      // Legacy Firebase writes removed - history is now stored in PostgreSQL

      // Trigger global task completed event for PersonalStats
      if (typeof window !== "undefined") {
        const completionData = {
          userId: user.id,
          displayName: user.displayName,
          task,
          duration,
          timestamp: Date.now(),
          completed: true,
        };
        const windowWithTask = window as Window & { addCompletedTask?: (task: typeof completionData) => void };
        if (windowWithTask.addCompletedTask) {
          windowWithTask.addCompletedTask(completionData);
        }
      }

      // notifyEvent is now handled by Timer component conditionally based on duration
      // Get user name from Firebase Users
      let displayName = user.displayName;
      try {
        const userRef = ref(rtdb, `Users/${user.id}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          const userData = snapshot.val();
          const firstName = userData.firstName || "";
          const lastName = userData.lastName || "";
          displayName = `${firstName}${lastName ? ' ' + lastName : ''}`.trim() || user.displayName;
        }
      } catch (error) {
        console.error('[RoomShell] Failed to fetch user data from Firebase:', error);
      }
      
      // Add flying message to GlobalEffects
      const flyingMessageId = `${user.id}-complete-${Date.now()}`;
      const flyingMessageRef = ref(rtdb, `GlobalEffects/${currentInstance.id}/flyingMessages/${flyingMessageId}`);
      set(flyingMessageRef, {
        text: `🏆 ${displayName} has successfully completed a task!`,
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
    // showContacts, // People Modal - Feature deprioritized
    closeAllModals,
    setLocalVolume,
  ]);

  // Remove the login wall - allow guest users to access rooms
  if (!userReady) {
    // Still loading, show a loading state
    return (
      <div className="min-h-screen flex items-center justify-center bg-elegant-dark text-white">
        <div className="flex flex-col items-center justify-center">
          <DotSpinner color="#FFAA00" size={60} />
          <p className="mt-4 text-gray-300">Loading room...</p>
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

        {/* Feedback Button - Right Side */}
        <button
          className="fixed right-0 top-1/2 -translate-y-1/2 bg-gray-900 text-gray-400 hover:text-white text-sm font-bold py-2 px-2 rounded-r-md shadow-lg hover:bg-gray-800 z-40 transition-all duration-300"
          onClick={() => window.open('https://getlockedin.featurebase.app/', '_blank')}
          style={{ writingMode: "vertical-lr", textOrientation: "mixed", transform: "rotate(180deg)" }}
        >
          ✨ Feedback
        </button>

        <div className="min-h-screen flex flex-col items-center justify-center bg-elegant-dark text-white relative">
          {/* Mobile Menu - visible only on mobile */}
          <MobileMenu
            localVolume={localVolume}
            setLocalVolume={setLocalVolume}
            setShowHistory={setShowHistory}
            setShowLeaderboard={setShowLeaderboard}
            setShowAnalytics={setShowAnalytics}
            setShowTaskList={setShowTaskList}
            setShowPreferences={setShowPreferences}
            setShowRoomsModal={setShowRoomsModal}
            setShowInviteModal={setShowInviteModal}
            instanceType={currentInstance.type}
            closeAllModals={closeAllModals}
          />
          
          {/* Top right container for controls - hidden on mobile */}
          <div className="fixed top-[8px] right-4 z-50 hidden md:flex items-center gap-2 max-w-[calc(100vw-6rem)]">
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
              availabilityStatus={availabilityStatus}
              setAvailabilityStatus={setAvailabilityStatus}
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
          <div className="flex flex-col items-center justify-center">
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
            
            {/* Counter for Deep Work Mode - integrated below input */}
            {showCounter && !showDeepWorkNotes && !isPomodoroMode && (isGuestUser || activeTaskId) && (
              <div className="mb-8 flex justify-center w-full">
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl pt-6 pb-4 px-6 shadow-xl border border-gray-700/50 flex flex-col items-center">
                  <div className="flex items-center justify-center gap-6">
                    <button
                      onClick={() => {
                        const newValue = Math.max(0, counterValue - 1);
                        
                        // Update Redux 
                        dispatch(setCounterValue(newValue));
                        
                        if (isGuestUser && activeTask) {
                          // For guest users, just save to cache
                          LocalCounterCache.saveCounter(activeTask.id, newValue);
                        } else if (activeTask) {
                          // For authenticated users, update task and database
                          dispatch(updateTaskCounterLocal({ id: activeTask.id, counter: newValue }));
                          updateCounterInDatabase(activeTask.id, newValue);
                        }
                      }}
                      className="group relative w-14 h-14 bg-gradient-to-br from-red-500 to-red-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-110 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 flex-shrink-0"
                    >
                      <span className="text-white text-3xl font-bold select-none group-hover:scale-110 transition-transform">−</span>
                      <div className="absolute inset-0 rounded-full bg-white opacity-0 group-hover:opacity-20 transition-opacity"></div>
                    </button>
                    
                    <div className="flex flex-col items-center">
                      <span className="text-gray-400 text-xs uppercase tracking-wider mb-1">Counter</span>
                      {isEditingCounter ? (
                        <input
                          type="text"
                          value={editingCounterValue}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Only allow numbers
                            if (value === "" || /^\d+$/.test(value)) {
                              setEditingCounterValue(value);
                            }
                          }}
                          onBlur={() => {
                            const newValue = Math.max(0, parseInt(editingCounterValue) || 0);
                            // Update Redux
                            dispatch(setCounterValue(newValue));
                            
                            if (isGuestUser && activeTask) {
                              // For guest users, just save to cache
                              LocalCounterCache.saveCounter(activeTask.id, newValue);
                            } else if (activeTask) {
                              // For authenticated users, update task and database
                              dispatch(updateTaskCounterLocal({ id: activeTask.id, counter: newValue }));
                              updateCounterInDatabase(activeTask.id, newValue);
                            }
                            setIsEditingCounter(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            } else if (e.key === "Escape") {
                              setEditingCounterValue(counterValue.toString());
                              setIsEditingCounter(false);
                            }
                          }}
                          className="text-5xl font-bold text-white bg-gray-700/50 rounded-lg px-2 text-center tabular-nums w-[120px] outline-none focus:ring-2 focus:ring-[#FFAA00] transition-all"
                          autoFocus
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingCounterValue(counterValue.toString());
                            setIsEditingCounter(true);
                          }}
                          className="text-5xl font-bold text-white tabular-nums w-[120px] text-center hover:text-[#FFAA00] transition-colors cursor-pointer"
                        >
                          {counterValue}
                        </button>
                      )}
                    </div>
                    
                    <button
                      onClick={() => {
                        const newValue = counterValue + 1;
                        // Update Redux 
                        dispatch(setCounterValue(newValue));
                        
                        if (isGuestUser && activeTask) {
                          // For guest users, just save to cache
                          LocalCounterCache.saveCounter(activeTask.id, newValue);
                        } else if (activeTask) {
                          // For authenticated users, update task and database
                          dispatch(updateTaskCounterLocal({ id: activeTask.id, counter: newValue }));
                          updateCounterInDatabase(activeTask.id, newValue);
                        }
                      }}
                      className="group relative w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-110 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 flex-shrink-0"
                    >
                      <span className="text-white text-3xl font-bold select-none group-hover:scale-110 transition-transform">+</span>
                      <div className="absolute inset-0 rounded-full bg-white opacity-0 group-hover:opacity-20 transition-opacity"></div>
                    </button>
                  </div>
                  
                  <button
                    onClick={() => {
                      // Update Redux 
                      dispatch(setCounterValue(0));
                      
                      if (isGuestUser && activeTask) {
                        // For guest users, just save to cache
                        LocalCounterCache.saveCounter(activeTask.id, 0);
                      } else if (activeTask) {
                        // For authenticated users, update task and database
                        dispatch(updateTaskCounterLocal({ id: activeTask.id, counter: 0 }));
                        updateCounterInDatabase(activeTask.id, 0);
                      }
                    }}
                    className="mt-4 w-full text-gray-500 hover:text-gray-300 text-sm transition-colors duration-200 cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
            
            {/* Task Notes for Deep Work Mode - integrated below input */}
            {showDeepWorkNotes && !showCounter && !isPomodoroMode && activeTaskId && (
              <div className="mb-8 flex justify-center w-full max-h-52 overflow-y-auto">
                <TaskNotes 
                  taskId={activeTaskId}
                  taskName={reduxTasks.find(t => t.id === activeTaskId)?.name}
                  isVisible={showDeepWorkNotes}
                />
              </div>
            )}
          </div>
          {/* Timer/Pomodoro is always mounted */}
          <div className="flex flex-col items-center justify-center w-full">
            {/* Notes - inline above timer, only show when task exists */}
            {task.trim() && <Notes isOpen={showNotes} task={task} taskId={currentTaskId} />}

            {/* Conditionally render Timer or Pomodoro based on mode */}
            {!isPomodoroMode ? (
              <>
                <Timer
                key={timerResetKey}
                onActiveChange={handleActiveChange}
                startRef={timerStartRef}
                pauseRef={timerPauseRef}
                onComplete={handleComplete}
                secondsRef={timerSecondsRef}
                localVolume={localVolume}
                onTaskRestore={(taskName, isRunning, taskId) => {
                  dispatch(setCurrentInput(taskName));
                  if (taskId) {
                    dispatch(setCurrentTask({ id: taskId, name: taskName }));
                    dispatch(setActiveTask(taskId));
                  }
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
                isQuittingRef={isQuittingRef}
              />
                {/* Toggle buttons for Counter and Notes - centered below Timer */}
                <div className="flex justify-center mt-6 gap-4">
                  <button
                    className={`text-sm font-mono underline underline-offset-4 select-none transition-all px-2 py-1 bg-transparent border-none ${
                      !activeTaskId 
                        ? "text-gray-600 cursor-not-allowed" 
                        : showCounter 
                          ? "text-[#FFAA00] hover:text-[#FF9900] cursor-pointer" 
                          : "text-gray-400 hover:text-[#FFAA00] cursor-pointer"
                    }`}
                    onClick={async () => {
                      if (!activeTaskId) return;
                      
                      // Toggle counter on, notes off
                      dispatch(setPreference({ key: 'toggle_counter', value: !showCounter }));
                      if (!showCounter && showDeepWorkNotes) {
                        dispatch(setPreference({ key: 'toggle_notes', value: false }));
                      }
                      
                      // Update PostgreSQL in background
                      if (reduxUser?.user_id) {
                        dispatch(updatePreferences({ 
                          userId: reduxUser.user_id, 
                          updates: { 
                            toggle_counter: !showCounter,
                            toggle_notes: !showCounter ? false : showDeepWorkNotes
                          } 
                        }));
                      }
                    }}
                    disabled={!activeTaskId}
                  >
                    Counter
                  </button>
                  
                  <button
                    className={`text-sm font-mono underline underline-offset-4 select-none transition-all px-2 py-1 bg-transparent border-none ${
                      !activeTaskId 
                        ? "text-gray-600 cursor-not-allowed" 
                        : showDeepWorkNotes 
                          ? "text-[#FFAA00] hover:text-[#FF9900] cursor-pointer" 
                          : "text-gray-400 hover:text-[#FFAA00] cursor-pointer"
                    }`}
                    onClick={async () => {
                      if (!activeTaskId) return;
                      
                      // Toggle notes on, counter off
                      dispatch(setPreference({ key: 'toggle_notes', value: !showDeepWorkNotes }));
                      if (!showDeepWorkNotes && showCounter) {
                        dispatch(setPreference({ key: 'toggle_counter', value: false }));
                      }
                      
                      // Update PostgreSQL in background
                      if (reduxUser?.user_id) {
                        dispatch(updatePreferences({ 
                          userId: reduxUser.user_id, 
                          updates: { 
                            toggle_notes: !showDeepWorkNotes,
                            toggle_counter: !showDeepWorkNotes ? false : showCounter
                          } 
                        }));
                      }
                    }}
                    disabled={!activeTaskId}
                  >
                    Notes
                  </button>
                </div>
              </>
            ) : (
              <>
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
                  isCompact={showDeepWorkNotes || showCounter}
                  showNotes={showDeepWorkNotes && !!activeTaskId}
                  showCounter={showCounter && !!activeTaskId}
                  notesContent={
                    showDeepWorkNotes && activeTaskId ? (
                      <TaskNotes 
                        taskId={activeTaskId}
                        taskName={reduxTasks.find(t => t.id === activeTaskId)?.name}
                        isVisible={showDeepWorkNotes}
                      />
                    ) : null
                  }
                  counterContent={
                    showCounter && activeTaskId ? (
                      <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl pt-6 pb-4 px-6 shadow-xl border border-gray-700/50 flex flex-col items-center">
                        <div className="flex items-center justify-center gap-6">
                          <button
                            onClick={() => {
                              if (activeTask) {
                                const newValue = Math.max(0, counterValue - 1);
                                dispatch(updateTaskCounterLocal({ id: activeTask.id, counter: newValue }));
                                dispatch(setCounterValue(newValue));
                                updateCounterInDatabase(activeTask.id, newValue);
                              }
                            }}
                            className="group relative w-14 h-14 bg-gradient-to-br from-red-500 to-red-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-110 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 flex-shrink-0"
                          >
                            <span className="text-white text-3xl font-bold select-none group-hover:scale-110 transition-transform">−</span>
                            <div className="absolute inset-0 rounded-full bg-white opacity-0 group-hover:opacity-20 transition-opacity"></div>
                          </button>
                          
                          <div className="flex flex-col items-center">
                            <span className="text-gray-400 text-xs uppercase tracking-wider mb-1">Counter</span>
                            {isEditingCounter ? (
                              <input
                                type="text"
                                value={editingCounterValue}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (value === "" || /^\d+$/.test(value)) {
                                    setEditingCounterValue(value);
                                  }
                                }}
                                onBlur={() => {
                                  const newValue = Math.max(0, parseInt(editingCounterValue) || 0);
                                  if (activeTask) {
                                    dispatch(updateTaskCounterLocal({ id: activeTask.id, counter: newValue }));
                                    dispatch(setCounterValue(newValue));
                                    updateCounterInDatabase(activeTask.id, newValue);
                                  }
                                  setIsEditingCounter(false);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.currentTarget.blur();
                                  } else if (e.key === "Escape") {
                                    setEditingCounterValue(counterValue.toString());
                                    setIsEditingCounter(false);
                                  }
                                }}
                                className="text-5xl font-bold text-white bg-gray-700/50 rounded-lg px-2 text-center tabular-nums w-[120px] outline-none focus:ring-2 focus:ring-[#FFAA00] transition-all"
                                autoFocus
                              />
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingCounterValue(counterValue.toString());
                                  setIsEditingCounter(true);
                                }}
                                className="text-5xl font-bold text-white tabular-nums w-[120px] text-center hover:text-[#FFAA00] transition-colors cursor-pointer"
                              >
                                {counterValue}
                              </button>
                            )}
                          </div>
                          
                          <button
                            onClick={() => {
                              if (activeTask) {
                                const newValue = counterValue + 1;
                                dispatch(updateTaskCounterLocal({ id: activeTask.id, counter: newValue }));
                                dispatch(setCounterValue(newValue));
                                updateCounterInDatabase(activeTask.id, newValue);
                              }
                            }}
                            className="group relative w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-110 transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 flex-shrink-0"
                          >
                            <span className="text-white text-3xl font-bold select-none group-hover:scale-110 transition-transform">+</span>
                            <div className="absolute inset-0 rounded-full bg-white opacity-0 group-hover:opacity-20 transition-opacity"></div>
                          </button>
                        </div>
                        
                        <button
                          onClick={() => {
                            if (activeTask) {
                              dispatch(updateTaskCounterLocal({ id: activeTask.id, counter: 0 }));
                              dispatch(setCounterValue(0));
                              updateCounterInDatabase(activeTask.id, 0);
                            }
                          }}
                          className="mt-4 w-full text-gray-500 hover:text-gray-300 text-sm transition-colors duration-200 cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>
                    ) : null
                  }
                  onNotesToggle={
                    async () => {
                      if (!activeTaskId) return;
                      
                      // Toggle notes on, counter off
                      dispatch(setPreference({ key: 'toggle_notes', value: !showDeepWorkNotes }));
                      if (!showDeepWorkNotes && showCounter) {
                        dispatch(setPreference({ key: 'toggle_counter', value: false }));
                      }
                      
                      // Update PostgreSQL in background
                      if (reduxUser?.user_id) {
                        dispatch(updatePreferences({ 
                          userId: reduxUser.user_id, 
                          updates: { 
                            toggle_notes: !showDeepWorkNotes,
                            toggle_counter: !showDeepWorkNotes ? false : showCounter
                          } 
                        }));
                      }
                    }
                  }
                  onCounterToggle={
                    async () => {
                      if (!activeTaskId) return;
                      
                      // Toggle counter on, notes off
                      dispatch(setPreference({ key: 'toggle_counter', value: !showCounter }));
                      if (!showCounter && showDeepWorkNotes) {
                        dispatch(setPreference({ key: 'toggle_notes', value: false }));
                      }
                      
                      // Update PostgreSQL in background
                      if (reduxUser?.user_id) {
                        dispatch(updatePreferences({ 
                          userId: reduxUser.user_id, 
                          updates: { 
                            toggle_counter: !showCounter,
                            toggle_notes: !showCounter ? false : showDeepWorkNotes
                          } 
                        }));
                      }
                    }
                  }
                  hasActiveTask={!!activeTaskId}
                  onTaskRestore={(taskName, isRunning, taskId) => {
                    dispatch(setCurrentInput(taskName));
                    if (taskId) {
                      dispatch(setCurrentTask({ id: taskId, name: taskName }));
                      dispatch(setActiveTask(taskId));
                    }
                    if (isRunning) {
                      dispatch(lockInput());
                    }
                    dispatch(setHasStartedRedux(true));
                  }}
                />
              </>
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
            {/* Contacts Section - People Modal - Feature deprioritized */}
            {/* <button
              className="flex items-center gap-3 group relative cursor-pointer"
              onClick={() => {
                closeAllModals();
                setShowContacts(true);
              }}
            >
              <div className="relative">
                <div
                  className="w-10 h-10 bg-gray-400 group-hover:bg-[#FFAA00] transition-all duration-300 transform group-hover:scale-110"
                  style={{
                    WebkitMask: `url(/contacts.svg) no-repeat center`,
                    mask: `url(/contacts.svg) no-repeat center`,
                    WebkitMaskSize: "85%",
                    maskSize: "85%",
                  }}
                />
                {/* Glow effect on hover */}
                {/* <div className="absolute inset-0 bg-[#FFAA00] opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300 rounded-full"></div> */}
                {/* Notification badge */}
                {/* {availabilityStatus !== "dnd" && peopleNotificationCount > 0 && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {peopleNotificationCount}
                  </div>
                )} */}
              {/* </div>
              <span className="text-gray-400 text-sm font-mono cursor-pointer underline underline-offset-4 select-none group-hover:text-[#FFAA00] transition-all duration-300 opacity-0 group-hover:opacity-100 absolute left-12 whitespace-nowrap">
                People
              </span>
            </button> */}
            {/* WorkSpace Section */}
            <button
              className="flex items-center gap-3 group relative cursor-pointer"
              onClick={() => {
                closeAllModals();
                setShowRooms(true);
              }}
            >
              <div className="relative">
                <svg 
                  className="w-10 h-10 text-gray-400 group-hover:text-[#FFAA00] transition-all duration-300 transform group-hover:scale-110 p-[3px]"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <rect
                    x="3"
                    y="3"
                    width="7"
                    height="7"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <rect
                    x="14"
                    y="3"
                    width="7"
                    height="7"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <rect
                    x="3"
                    y="14"
                    width="7"
                    height="7"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <rect
                    x="14"
                    y="14"
                    width="7"
                    height="7"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                {/* Glow effect on hover */}
                <div className="absolute inset-0 bg-[#FFAA00] opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300 rounded-full"></div>
              </div>
              <span className="text-gray-400 text-sm font-mono cursor-pointer underline underline-offset-4 select-none group-hover:text-[#FFAA00] transition-all duration-300 opacity-0 group-hover:opacity-100 absolute left-12 whitespace-nowrap">
                Workspace
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
          {/* People Modal - Feature deprioritized */}
          {/* {showContacts && (
            <Contacts 
              onClose={() => setShowContacts(false)} 
              availabilityStatus={availabilityStatus}
              setAvailabilityStatus={setAvailabilityStatus}
              onNotificationCountChange={setPeopleNotificationCount}
              messagesNotificationCount={messagesNotificationCount}
              setMessagesNotificationCount={setMessagesNotificationCount}
              requestsNotificationCount={requestsNotificationCount}
              setRequestsNotificationCount={setRequestsNotificationCount}
            />
          )} */}
          {showRooms && <WorkSpace onClose={() => setShowRooms(false)} />}
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

        {/* Invite Popup */}
        <InvitePopup 
          isOpen={showInvitePopup} 
          onClose={async () => {
            setShowInvitePopup(false);
            
            // Get milestone data if it exists
            const milestoneData = (window as Window & { milestoneData?: MilestoneData }).milestoneData;
            
            if (!milestoneData?.milestone) {
              return;
            }
            
            const milestoneToMark = milestoneData.milestone;
            
            try {
              const body = {
                milestone: milestoneToMark,
                channel: "invite_popup",
              };
              
              if (!reduxUser?.user_id) {
                return;
              }
              
              const response = await fetch("/api/user/milestones/shown", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-User-Id": reduxUser.user_id,
                },
                body: JSON.stringify(body),
              });
              
              await response.json();
            } catch {
              // Silently fail
            }
            
            // Clear milestone data if it exists
            if (milestoneData) {
              delete (window as Window & { milestoneData?: MilestoneData }).milestoneData;
            }
          }}
          milestone={(window as Window & { milestoneData?: MilestoneData }).milestoneData?.milestone}
          stats={(window as Window & { milestoneData?: MilestoneData }).milestoneData?.stats}
        />
      </>
    );
  }
  return null;
}
