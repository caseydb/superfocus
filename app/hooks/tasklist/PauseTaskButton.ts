import { useCallback } from "react";

export function usePauseTaskButton() {
  const handlePauseTask = useCallback((onPauseTimer?: () => void) => {
    if (onPauseTimer) {
      onPauseTimer();
    }
  }, []);

  return { handlePauseTask };
}