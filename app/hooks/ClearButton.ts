import { useCallback } from "react";

interface ClearButtonOptions {
  timerSeconds: number;
  task: string;
  setShowQuitModal: (show: boolean) => void;
  setTimerRunning: (running: boolean) => void;
  setTask: (task: string) => void;
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
    setInputLocked(false);
    setHasStarted(false);
  }, []);

  return { handleClear };
}