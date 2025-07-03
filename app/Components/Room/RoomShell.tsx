"use client";
import React, { useEffect, useState } from "react";
import { useInstance } from "../Instances";
import { useRouter } from "next/navigation";
import ActiveWorkers from "./ActiveWorkers";
import { rtdb } from "../../../lib/firebase";
import { ref, set, remove, push, onValue, off, onDisconnect } from "firebase/database";
import TaskInput from "./TaskInput";
import Timer from "./Timer";
import History from "./History";
import Controls from "./Controls";
import FlyingMessages from "./FlyingMessages";
import Leaderboard from "./Leaderboard";
import Sounds from "./Sounds";
import SignIn from "../SignIn";

export default function RoomShell({ roomUrl }: { roomUrl: string }) {
  const { instances, currentInstance, joinInstance, user, userReady } = useInstance();
  const [loading, setLoading] = useState(true);
  const [roomFound, setRoomFound] = useState(false);
  const router = useRouter();
  const [task, setTask] = useState("");
  const [inputLocked, setInputLocked] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [timerResetKey, setTimerResetKey] = useState(0);
  const timerStartRef = React.useRef<() => void>(null!);
  const [showHistory, setShowHistory] = useState(false);
  const timerSecondsRef = React.useRef<number>(0);
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [flyingMessages, setFlyingMessages] = useState<
    {
      id: string;
      text: string;
      color: string;
      userId?: string;
    }[]
  >([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHistoryTooltip, setShowHistoryTooltip] = useState(false);
  const [realTimeUserCount, setRealTimeUserCount] = useState(0);
  const [localVolume, setLocalVolume] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("lockedin_volume");
      if (stored !== null) return Number(stored);
    }
    return 0.2;
  });

  // Check if there's a saved timer state with time > 0
  const hasSavedTimerState = () => {
    if (typeof window !== "undefined" && currentInstance) {
      const saved = localStorage.getItem("lockedin_timer_state");
      if (saved) {
        try {
          const timerState = JSON.parse(saved);
          return timerState.roomKey === currentInstance.id && timerState.userId === user?.id && timerState.seconds > 0;
        } catch {
          return false;
        }
      }
    }
    return false;
  };

  // Persist volume to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lockedin_volume", String(localVolume));
    }
  }, [localVolume]);

  // Listen to real-time user count from RTDB
  useEffect(() => {
    if (!currentInstance) return;
    const usersRef = ref(rtdb, `instances/${currentInstance.id}/users`);
    const handle = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRealTimeUserCount(Object.keys(data).length);
      } else {
        setRealTimeUserCount(0);
      }
    });
    return () => off(usersRef, "value", handle);
  }, [currentInstance]);

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

  // Clean up on unmount or room change
  useEffect(() => {
    // Set up disconnect handling when component mounts or user/instance changes
    if (currentInstance && user) {
      const activeRef = ref(rtdb, `instances/${currentInstance.id}/activeUsers/${user.id}`);
      onDisconnect(activeRef).remove();
    }

    return () => {
      if (currentInstance && user) {
        const activeRef = ref(rtdb, `instances/${currentInstance.id}/activeUsers/${user.id}`);
        remove(activeRef);
      }
    };
  }, [currentInstance, user]);

  // Track active user status in Firebase RTDB
  const handleActiveChange = (isActive: boolean) => {
    if (!currentInstance || !user) return;
    const activeRef = ref(rtdb, `instances/${currentInstance.id}/activeUsers/${user.id}`);
    if (isActive) {
      set(activeRef, { id: user.id, displayName: user.displayName });
      // Set up automatic cleanup when user disconnects
      onDisconnect(activeRef).remove();
      setInputLocked(true);
      setHasStarted(true);
    } else {
      remove(activeRef);
      setInputLocked(true); // keep locked until complete/clear/quit
    }
  };

  const handleClear = () => {
    if (timerSecondsRef.current > 0 && task.trim()) {
      setShowQuitModal(true);
      return;
    }
    setTask("");
    setTimerResetKey((k) => k + 1);
    setInputLocked(false);
    setHasStarted(false);
    // Clear saved timer state when clearing
    if (typeof window !== "undefined") {
      localStorage.removeItem("lockedin_timer_state");
    }
  };

  // Add event notification for complete and quit
  function notifyEvent(type: "complete" | "quit") {
    if (currentInstance) {
      const lastEventRef = ref(rtdb, `instances/${currentInstance.id}/lastEvent`);
      set(lastEventRef, { displayName: user.displayName, type, timestamp: Date.now() });
    }
  }

  const handleQuitConfirm = () => {
    if (timerSecondsRef.current > 0 && currentInstance && user && task.trim()) {
      const hours = Math.floor(timerSecondsRef.current / 3600)
        .toString()
        .padStart(2, "0");
      const minutes = Math.floor((timerSecondsRef.current % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const secs = (timerSecondsRef.current % 60).toString().padStart(2, "0");
      const historyRef = ref(rtdb, `instances/${currentInstance.id}/history`);
      push(historyRef, {
        userId: user.id,
        displayName: user.displayName,
        task: task + " (Quit Early)",
        duration: `${hours}:${minutes}:${secs}`,
        timestamp: Date.now(),
      });
      notifyEvent("quit");
      // Add flying message for quit
      const id = `${user.id}-quit-${Date.now()}`;
      setFlyingMessages((msgs) => [
        ...msgs,
        {
          id,
          text: `💀 ${user.displayName} folded faster than a lawn chair.`,
          color: "text-red-500",
          userId: user.id,
        },
      ]);
      setTimeout(() => {
        setFlyingMessages((msgs) => msgs.filter((m) => m.id !== id));
      }, 7000);
    }
    setTask("");
    setTimerResetKey((k) => k + 1);
    setInputLocked(false);
    setHasStarted(false);
    setShowQuitModal(false);
    // Clear saved timer state when quitting
    if (typeof window !== "undefined") {
      localStorage.removeItem("lockedin_timer_state");
    }
  };

  const handlePushOn = () => {
    setShowQuitModal(false);
  };

  // Complete handler: reset timer, clear input, set inactive
  const handleComplete = (duration: string) => {
    setTask("");
    setTimerResetKey((k) => k + 1);
    setInputLocked(false);
    setHasStarted(false);
    // Clear saved timer state when completing
    if (typeof window !== "undefined") {
      localStorage.removeItem("lockedin_timer_state");
    }
    if (currentInstance && user) {
      const activeRef = ref(rtdb, `instances/${currentInstance.id}/activeUsers/${user.id}`);
      remove(activeRef);
      // Save to history
      const historyRef = ref(rtdb, `instances/${currentInstance.id}/history`);
      push(historyRef, {
        userId: user.id,
        displayName: user.displayName,
        task,
        duration,
        timestamp: Date.now(),
      });
      notifyEvent("complete");
      // Add flying message
      const id = `${user.id}-${Date.now()}`;
      setFlyingMessages((msgs) => [
        ...msgs,
        {
          id,
          text: `🏆 ${user.displayName} has successfully completed a task!`,
          color: "text-green-400",
          userId: user.id,
        },
      ]);
      setTimeout(() => {
        setFlyingMessages((msgs) => msgs.filter((m) => m.id !== id));
      }, 7000);
    }
  };

  if (!userReady || !user.id || user.id.startsWith("user-")) {
    // Not signed in: mask everything with SignIn
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center justify-center w-full h-full">
          <div className="w-full flex flex-col items-center mb-10 mt-2">
            <h1 className="text-4xl md:text-5xl font-extrabold text-white text-center mb-2 drop-shadow-lg">
              Drop In. Lock In. Get Sh*t Done.
            </h1>
            <p className="text-lg md:text-2xl text-gray-300 text-center max-w-2xl mx-auto opacity-90 font-medium">
              Level up your work with others in the zone.
            </p>
          </div>
          <SignIn />
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
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white relative">
          {/* User name in top left */}
          <Controls className="fixed top-4 right-8 z-50" localVolume={localVolume} setLocalVolume={setLocalVolume} />
          {/* Room type indicator at top center */}
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-40 text-gray-500 text-base font-mono select-none">
            {currentInstance.type === "private" ? "Private Room" : "Public Room"} (
            {realTimeUserCount === 1 ? "Just you" : `${realTimeUserCount} ppl`})
          </div>
          <FlyingMessages
            flyingMessages={flyingMessages}
            flyingPlaceholders={[]}
            activeWorkers={currentInstance.users.map((u) => ({ name: u.displayName, userId: u.id }))}
          />
          <Sounds roomId={currentInstance.id} localVolume={localVolume} />
          <ActiveWorkers roomId={currentInstance.id} />
          {/* Main content: TaskInput or Timer/room UI */}
          <div className={showHistory ? "hidden" : "flex flex-col items-center justify-center"}>
            <TaskInput
              task={task}
              setTask={setTask}
              disabled={(hasStarted && inputLocked) || hasSavedTimerState()}
              onStart={() => timerStartRef.current && timerStartRef.current()}
            />
          </div>
          <div className={showHistory ? "" : "hidden"}>
            <History roomId={currentInstance.id} />
          </div>
          {/* Timer is always mounted, just hidden when history is open */}
          <div
            style={{ display: showHistory ? "none" : "block" }}
            className="flex flex-col items-center justify-center"
          >
            <Timer
              key={timerResetKey}
              onActiveChange={handleActiveChange}
              startRef={timerStartRef}
              onComplete={handleComplete}
              secondsRef={timerSecondsRef}
              requiredTask={!!task.trim()}
              task={task}
              onTaskRestore={setTask}
            />
            {task.trim() && (
              <div className="flex justify-center w-full">
                <button
                  className="mt-4 text-gray-500 text-base font-mono underline underline-offset-4 select-none hover:text-[#00b4ff] transition-colors px-2 py-1 bg-transparent border-none cursor-pointer"
                  onClick={handleClear}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          {/* Bottom bar controls */}
          <button
            className="fixed bottom-4 left-8 z-40 text-gray-500 text-base font-mono underline underline-offset-4 select-none hover:text-[#00b4ff] transition-colors px-2 py-1 bg-transparent border-none cursor-pointer"
            onClick={() => {
              if (currentInstance.type === "public") {
                setShowHistoryTooltip(true);
                setTimeout(() => setShowHistoryTooltip(false), 3000);
              } else {
                setShowHistory((v) => !v);
              }
            }}
          >
            {showHistory ? "Back to Room" : "History"}
          </button>
          {/* History tooltip for public rooms */}
          {showHistoryTooltip && (
            <div className="fixed bottom-16 left-8 z-50 bg-[#181A1B] text-white px-4 py-2 rounded-lg shadow-lg border border-[#23272b] text-sm font-mono">
              History is only available in private rooms.
              <div className="absolute -bottom-1 left-4 w-2 h-2 bg-[#181A1B] border-r border-b border-[#23272b] transform rotate-45"></div>
            </div>
          )}
          <div
            className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40 text-gray-500 text-base font-mono cursor-pointer underline underline-offset-4 select-none hover:text-[#00b4ff] transition-colors"
            onClick={() => setShowLeaderboard(true)}
          >
            Leaderboard
          </div>
          <button
            className="fixed bottom-4 right-8 z-40 text-gray-500 text-base font-mono underline underline-offset-4 select-none hover:text-[#00b4ff] transition-colors px-2 py-1 bg-transparent border-none cursor-pointer"
            onClick={() => {
              setShowInviteModal(true);
            }}
          >
            + Invite People
          </button>
          {showQuitModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div
                className="bg-red-600 rounded-2xl shadow-2xl px-6 py-8 flex flex-col items-center gap-6 border-4 border-red-700"
                style={{ minWidth: 350, maxWidth: "90vw" }}
              >
                <div className="text-white text-3xl font-extrabold text-center mb-4">
                  Quiting? This will be logged to history.
                </div>
                <div className="flex gap-6 mt-2">
                  <button
                    className="bg-white text-red-600 font-bold text-xl px-8 py-3 rounded-lg shadow hover:bg-red-100 transition"
                    onClick={handleQuitConfirm}
                  >
                    Quit
                  </button>
                  <button
                    className="bg-white text-gray-700 font-bold text-xl px-8 py-3 rounded-lg shadow hover:bg-gray-200 transition"
                    onClick={handlePushOn}
                  >
                    Push On
                  </button>
                </div>
              </div>
            </div>
          )}
          {showLeaderboard && currentInstance && (
            <Leaderboard roomId={currentInstance.id} onClose={() => setShowLeaderboard(false)} />
          )}
        </div>
        {/* Invite Modal - rendered as separate overlay */}
        {showInviteModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={() => setShowInviteModal(false)}
          >
            <div
              className="bg-[#181A1B] rounded-2xl shadow-2xl p-8 w-full max-w-md border border-[#23272b] relative"
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
                  className="flex-1 px-4 py-3 rounded-lg bg-[#23272b] text-gray-300 border border-[#23272b] focus:border-[#00b4ff] outline-none font-mono text-sm"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 3000);
                  }}
                  className={`px-6 py-3 font-bold rounded-lg hover:scale-105 transition-all flex items-center gap-2 ${
                    copied ? "bg-green-500 text-white" : "bg-[#00b4ff] text-white"
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
      </>
    );
  }
  return null;
}
