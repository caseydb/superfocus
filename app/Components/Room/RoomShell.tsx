"use client";
import React, { useEffect, useState, useRef } from "react";
import { useInstance } from "../Instances";
import { useRouter } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { addTask, setActiveTask, createTaskThunk, updateTaskStatusThunk, addTaskToBufferWhenStarted, fetchTasksFromBuffer, endTimeSegment, startTimeSegment, transferTaskToPostgres } from "../../store/taskSlice";
import { v4 as uuidv4 } from 'uuid';
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off, update, set, remove, push, runTransaction } from "firebase/database";
import ActiveWorkers from "./ActiveWorkers";
import TaskInput from "./TaskInput";
import Timer from "./Timer";
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

export default function RoomShell({ roomUrl }: { roomUrl: string }) {
  const { instances, currentInstance, joinInstance, user, userReady } = useInstance();
  const [loading, setLoading] = useState(true);
  const [roomFound, setRoomFound] = useState(false);
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  
  // Get user data from Redux store
  const reduxUser = useSelector((state: RootState) => state.user);
  const reduxTasks = useSelector((state: RootState) => state.tasks.tasks);
  const activeTaskId = useSelector((state: RootState) => state.tasks.activeTaskId);
  const [task, setTask] = useState("");
  const [inputLocked, setInputLocked] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [timerResetKey, setTimerResetKey] = useState(0);
  const timerStartRef = React.useRef<() => void>(null!);
  const timerPauseRef = React.useRef<() => void>(null!);
  const [showHistory, setShowHistory] = useState(false);
  const timerSecondsRef = React.useRef<number>(0);
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

  const [localVolume, setLocalVolume] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("lockedin_volume");
      if (stored !== null) return Number(stored);
    }
    return 0.2;
  });

  // Track previous volume for mute/unmute functionality
  const [previousVolume, setPreviousVolume] = useState(0.2);

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
  }, []);

  // Track if there's an active timer state from Firebase
  const [hasActiveTimer, setHasActiveTimer] = useState(false);
  const [currentTimerSeconds, setCurrentTimerSeconds] = useState(0);

  // Find taskId for current task
  useEffect(() => {
    if (!user?.id || !task.trim()) {
      setCurrentTaskId(null);
      return;
    }

    // Task list operations removed from TaskBuffer
    // Task ID should come from Redux state
    const activeTask = reduxTasks.find(t => t.name === task.trim());
    setCurrentTaskId(activeTask?.id || null);
  }, [user?.id, task, reduxTasks]);

  // Timer state is now stored with the task - removed separate timer state listener

  // Timer seconds tracking removed - handled by Timer component

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

  useEffect(() => {
    if (instances.length === 0) return;
    const targetRoom = instances.find((instance) => instance.url === roomUrl);
    if (targetRoom) {
      setRoomFound(true);
      if (!currentInstance || currentInstance.id !== targetRoom.id) {
        joinInstance(targetRoom.id);
      }
    } else {
      setRoomFound(false);
    }
    setLoading(false);
  }, [instances, roomUrl, currentInstance, joinInstance]);

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
    const handleBeforeUnload = () => {
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
            return null;
          } else {
            return {
              count: newCount,
              displayName: user.displayName,
              lastUpdated: Date.now(),
            };
          }
        });
      }

      off(tabCountRef, "value", handle);
    };
  }, [currentInstance, user]);

  // Track active user status in Firebase RTDB
  const handleActiveChange = (isActive: boolean) => {
    if (!currentInstance || !user) return;
    const activeRef = ref(rtdb, `rooms/${currentInstance.id}/activeUsers/${user.id}`);
    setTimerRunning(isActive);
    if (isActive) {
      set(activeRef, { id: user.id, displayName: user.displayName });
      // NOTE: Removed onDisconnect handlers - they conflict with our tab counting system
      // We rely entirely on manual tab counting via beforeunload and useEffect cleanup
      setInputLocked(true);
      setHasStarted(true);
    } else {
      // Always remove from activeUsers when timer is paused/stopped
      remove(activeRef);
      setInputLocked(true); // keep locked until complete/clear/quit
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

  // Tab title management - update every second when timer is running
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (timerRunning) {
      const updateTitle = () => {
        document.title = formatTime(timerSecondsRef.current);
      };
      interval = setInterval(updateTitle, 1000);
      updateTitle(); // Set immediately
    } else {
      document.title = "Locked In";
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerRunning]);

  // Listen for event notifications (🥊🏆💀)
  useEffect(() => {
    if (!currentInstance) return;
    const lastEventRef = ref(rtdb, `rooms/${currentInstance.id}/lastEvent`);
    let timeout: NodeJS.Timeout | null = null;
    let firstRun = true;
    const handle = onValue(lastEventRef, (snap) => {
      if (firstRun) {
        firstRun = false;
        return;
      }
      const val = snap.val();
      if (val && val.displayName && val.type) {
        let emoji = "";
        if (val.type === "start") emoji = "🥊";
        if (val.type === "complete") emoji = "🏆";
        if (val.type === "quit") emoji = "💀";
        document.title = `${emoji} ${val.displayName}`;
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
    });
    return () => {
      off(lastEventRef, "value", handle);
      if (timeout) clearTimeout(timeout);
    };
  }, [currentInstance, timerRunning]);

  // Listen for flying messages from Firebase
  useEffect(() => {
    if (!currentInstance) return;

    const flyingMessagesRef = ref(rtdb, `rooms/${currentInstance.id}/flyingMessages`);
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
        const now = Date.now();
        const recentMessages = messages.filter((msg) => now - msg.timestamp < 7000);

        setFlyingMessages(recentMessages);
      } else {
        setFlyingMessages([]);
      }
    });

    return () => off(flyingMessagesRef, "value", handle);
  }, [currentInstance]);

  const handleClear = () => {
    if (timerSecondsRef.current > 0 && task.trim()) {
      closeAllModals();
      setShowQuitModal(true);
      return;
    }
    setTimerRunning(false);
    setTask("");
    setTimerResetKey((k) => k + 1);
    setInputLocked(false);
    setHasStarted(false);
    // Clear Firebase timer state when clearing
    if (currentInstance && user?.id) {
      // Timer state is part of task - gets removed when task is removed
    }
  };

  // Add event notification for complete and quit
  function notifyEvent(type: "complete" | "quit") {
    if (currentInstance) {
      const lastEventRef = ref(rtdb, `rooms/${currentInstance.id}/lastEvent`);
      set(lastEventRef, { displayName: user.displayName, type, timestamp: Date.now() });
    }
  }

  const handleQuitConfirm = async () => {
    if (timerSecondsRef.current > 0 && currentInstance && user && task.trim()) {
      const hours = Math.floor(timerSecondsRef.current / 3600)
        .toString()
        .padStart(2, "0");
      const minutes = Math.floor((timerSecondsRef.current % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const secs = (timerSecondsRef.current % 60).toString().padStart(2, "0");
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

      // Also save to user's personal completion history for cross-room stats
      // Completion history removed from TaskBuffer - store elsewhere if needed
      
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

      // Only notify others if timer was > 5 seconds AND cooldown has passed
      if (timerSecondsRef.current > 5 && user?.id && currentInstance) {
        const now = Date.now();
        // Sound cooldowns removed from TaskBuffer - always notify
        notifyEvent("quit");
      }

      // Add flying message for quit to Firebase
      const flyingMessageId = `${user.id}-quit-${Date.now()}`;
      const flyingMessageRef = ref(rtdb, `rooms/${currentInstance.id}/flyingMessages/${flyingMessageId}`);
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
      
      // End time segment and transfer task from TaskBuffer to Postgres with quit status
      const activeTask = reduxTasks.find((t) => t.name === task?.trim());
      if (activeTask?.id && user?.id) {
        // First end the time segment to ensure duration is captured
        await dispatch(endTimeSegment({ 
          taskId: activeTask.id, 
          firebaseUserId: user.id,
        }) as any).unwrap();
        
        // Small delay to ensure Firebase has updated
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Then transfer to Postgres
        if (typeof window !== "undefined") {
          const token = localStorage.getItem("firebase_token") || "";
          try {
            const result = await dispatch(transferTaskToPostgres({ 
              taskId: activeTask.id, 
              firebaseUserId: user.id,
              status: "quit",
              token,
              duration: timerSecondsRef.current // Pass the actual timer seconds
            }) as any).unwrap();
            
            console.log("[QUIT] Task successfully transferred to Postgres and removed from TaskBuffer:", result);
          } catch (error) {
            console.error("[QUIT] Failed to transfer task to Postgres:", error);
            // Could show an error message to user here
          }
        }
      }
    }
    setTimerRunning(false);
    setTask("");
    setTimerResetKey((k) => k + 1);
    setInputLocked(false);
    setHasStarted(false);
    setShowQuitModal(false);
    // Clear Firebase timer state when quitting
    if (currentInstance && user?.id) {
      // Timer state is part of task - gets removed when task is removed
      // Remove user from activeUsers when quitting (same as complete)
      const activeRef = ref(rtdb, `rooms/${currentInstance.id}/activeUsers/${user.id}`);
      remove(activeRef);
    }
  };

  const handlePushOn = () => {
    setShowQuitModal(false);
  };

  // Complete handler: reset timer, clear input, set inactive
  const handleComplete = (duration: string) => {
    setTimerRunning(false);
    setTask("");
    setTimerResetKey((k) => k + 1);
    setInputLocked(false);
    setHasStarted(false);
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
      // Add flying message to Firebase
      const flyingMessageId = `${user.id}-complete-${Date.now()}`;
      const flyingMessageRef = ref(rtdb, `rooms/${currentInstance.id}/flyingMessages/${flyingMessageId}`);
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
  };

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
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center justify-center w-full h-full">
          <div className="w-full flex flex-col items-center mb-10 mt-2">
            <h1 className="text-4xl md:text-5xl font-extrabold text-white text-center mb-2 drop-shadow-lg">
              Drop In. Lock In. Get Sh<span style={{ color: "#FFAA00" }}>*</span>t Done.
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
    return <div className="min-h-screen flex items-center justify-center bg-black text-white">Loading...</div>;
  }
  if (!roomFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
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
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white relative">
          {/* Top right container for stats and controls */}
          <div className="fixed top-[13px] right-8 z-50 flex items-center gap-4 max-w-[calc(100vw-6rem)]">
            {/* Personal stats - remove its own positioning */}
            <div className="hidden sm:block">
              <PersonalStats />
            </div>
            {/* Controls - remove fixed positioning */}
            <Controls
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
          {/* Mobile personal stats stays at bottom */}
          <div className="sm:hidden">
            <PersonalStats />
          </div>
          {/* Analytics button - centered bottom - hidden on mobile */}
          <button
            className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[60] text-gray-400 text-sm sm:text-base font-mono underline underline-offset-4 select-none hover:text-[#FFAA00] transition-colors px-2 py-1 bg-transparent border-none cursor-pointer hidden sm:block"
            onClick={() => {
              closeAllModals();
              setShowAnalytics(true);
            }}
          >
            Analytics
          </button>
          {/* Tasks - desktop only: bottom right corner */}
          <button
            className={`fixed bottom-4 right-8 z-[60] text-gray-400 text-base font-mono underline underline-offset-4 select-none hover:text-[#FFAA00] transition-colors px-2 py-1 bg-transparent border-none cursor-pointer hidden sm:flex items-center ${
              showTaskList ? "!hidden" : ""
            }`}
            onClick={() => {
              closeAllModals();
              setShowTaskList(true);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mr-2">
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
            <TaskInput
              task={task}
              setTask={setTask}
              disabled={(hasStarted && inputLocked) || hasActiveTimer}
              onStart={() => {
                console.log("[RoomShell onStart] Starting with task:", task);
                if (timerStartRef.current && task.trim()) {
                  // Check if task already exists in Redux
                  const existingTask = reduxTasks.find(t => t.name === task.trim());
                  console.log("[RoomShell onStart] Existing task:", existingTask);
                  if (!existingTask && user?.id && currentInstance && reduxUser.user_id) {
                    // Generate proper UUID
                    const taskId = uuidv4();
                    
                    // Add optimistic task immediately
                    dispatch(addTask({ 
                      id: taskId, 
                      name: task.trim() 
                    }));
                    
                    // Persist to PostgreSQL database only
                    dispatch(createTaskThunk({ 
                      id: taskId,
                      name: task.trim(), 
                      userId: reduxUser.user_id, // PostgreSQL UUID
                    }) as any);
                    
                    // Set the new task as active
                    dispatch(setActiveTask(taskId));
                    
                    // Add to Firebase TaskBuffer when starting
                    console.log("[RoomShell onStart] Adding NEW task to buffer:", taskId);
                    dispatch(addTaskToBufferWhenStarted({
                      id: taskId,
                      name: task.trim(),
                      userId: reduxUser.user_id,
                      roomId: currentInstance.id,
                      firebaseUserId: user.id,
                    }) as any);
                    
                    // Start time segment tracking for new task
                    dispatch(startTimeSegment({ 
                      taskId: taskId, 
                      firebaseUserId: user.id 
                    }) as any);
                    
                  } else if (existingTask) {
                    // Set existing task as active
                    dispatch(setActiveTask(existingTask.id));
                    
                    // Add to Firebase TaskBuffer when starting
                    console.log("[RoomShell onStart] Adding EXISTING task to buffer:", existingTask.id);
                    dispatch(addTaskToBufferWhenStarted({
                      id: existingTask.id,
                      name: existingTask.name,
                      userId: reduxUser.user_id,
                      roomId: currentInstance.id,
                      firebaseUserId: user.id,
                    }) as any);
                    
                    // Start time segment tracking for existing task
                    dispatch(startTimeSegment({ 
                      taskId: existingTask.id, 
                      firebaseUserId: user.id 
                    }) as any);
                  }
                  
                  timerStartRef.current();
                  // Close task list when starting a task
                  setShowTaskList(false);
                }
              }}
              setShowTaskList={setShowTaskList}
            />
          </div>
          <div className={showHistory ? "" : "hidden"}>
            <History roomId={currentInstance.id} userId={user?.id} onClose={() => setShowHistory(false)} />
          </div>
          {/* Timer is always mounted, just hidden when history is open */}
          <div className={showHistory ? "hidden" : "flex flex-col items-center justify-center"}>
            {/* Notes - inline above timer, only show when task exists */}
            {task.trim() && <Notes isOpen={showNotes} task={task} taskId={currentTaskId} />}

            <Timer
              key={timerResetKey}
              onActiveChange={handleActiveChange}
              startRef={timerStartRef}
              pauseRef={timerPauseRef}
              onComplete={handleComplete}
              secondsRef={timerSecondsRef}
              requiredTask={!!task.trim()}
              task={task}
              localVolume={localVolume}
            />
            {task.trim() && (
              <div className="flex justify-center w-full gap-6">
                <button
                  className="mt-4 text-gray-400 text-base font-mono underline underline-offset-4 select-none hover:text-[#FFAA00] transition-colors px-2 py-1 bg-transparent border-none cursor-pointer"
                  onClick={handleClear}
                >
                  Clear
                </button>
                <button
                  className="mt-4 text-gray-400 text-base font-mono underline underline-offset-4 select-none hover:text-[#FFAA00] transition-colors px-2 py-1 bg-transparent border-none cursor-pointer"
                  onClick={() => setShowNotes(!showNotes)}
                >
                  Notes
                </button>
              </div>
            )}
          </div>

          <button
            className="fixed bottom-4 left-8 z-[60] text-gray-400 text-base font-mono cursor-pointer underline underline-offset-4 select-none hover:text-[#FFAA00] transition-colors px-2 py-1 bg-transparent border-none hidden sm:block"
            onClick={() => {
              closeAllModals();
              setShowLeaderboard(true);
            }}
          >
            Leaderboard
          </button>
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
                        onClick={handlePushOn}
                        className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
                      >
                        Push On
                      </button>
                      <button
                        onClick={handleQuitConfirm}
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
          {showLeaderboard && currentInstance && (
            <Leaderboard roomId={currentInstance.id} onClose={() => setShowLeaderboard(false)} />
          )}
          {showHistory && currentInstance && (
            <History roomId={currentInstance.id} userId={user?.id} onClose={() => setShowHistory(false)} />
          )}
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
            setTask(taskText);
            setShowTaskList(false);
            // Small delay to ensure task is set before starting timer
            setTimeout(() => {
              if (timerStartRef.current) {
                timerStartRef.current();
              }
            }, 50);
          }}
          currentTask={task}
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