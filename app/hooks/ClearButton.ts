import { useCallback } from "react";

interface ClearButtonOptions {
  timerSeconds: number;
  task: string;
  setShowQuitModal: (show: boolean) => void;
  setTimerRunning: (running: boolean) => void;
  setTask: (task: string) => void;
  setTimerResetKey: (fn: (prev: number) => number) => void;
  setInputLocked: (locked: boolean) => void;
  setHasStarted: (started: boolean) => void;
  closeAllModals: () => void;
}

export function useClearButton() {
  const handleClear = useCallback((options: ClearButtonOptions) => {
    const {
      timerSeconds,
      task,
      setShowQuitModal,
      setTimerRunning,
      setTask,
      setTimerResetKey,
      setInputLocked,
      setHasStarted,
      closeAllModals,
    } = options;

    if (timerSeconds > 0 && task.trim()) {
      closeAllModals();
      setShowQuitModal(true);
      return;
    }
    
    setTimerRunning(false);
    setTask("");
    setTimerResetKey((k) => k + 1);
    setInputLocked(false);
    setHasStarted(false);
  }, []);

  return { handleClear };
}