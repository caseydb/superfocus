import { useCallback } from "react";

export function useStartTaskButton() {
  const handleStartTask = useCallback(
    (taskText: string, onStartTask?: (text: string) => void) => {
      if (onStartTask) {
        onStartTask(taskText);
      }
    },
    []
  );

  return { handleStartTask };
}