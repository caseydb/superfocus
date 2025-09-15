"use client";

import { useEffect } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store/store";

export default function ThemeController() {
  const theme = useSelector((s: RootState) => s.preferences.theme || "dark");
  const pausedTimer = useSelector((s: RootState) => s.timer.isPaused);
  const pausedFromTask = useSelector((s: RootState) => {
    const id = s.tasks.activeTaskId;
    const task = s.tasks.tasks.find((t) => t.id === id);
    return task?.status === 'paused';
  });
  const paused = pausedTimer || pausedFromTask;
  const pausedFlash = useSelector((s: RootState) => s.preferences.paused_flash || false);
  const themeName = useSelector((s: RootState) => s.preferences.theme || 'dark');

  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    if (theme) el.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (paused && pausedFlash) {
      body.classList.add("paused-flashing");
    } else {
      body.classList.remove("paused-flashing");
    }
  }, [paused, pausedFlash]);

  // Toggle gutters/background flashing for all supported themes (dark, blue, warm)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    if (paused && pausedFlash) {
      body.classList.add('app-flash-bg');
    } else {
      body.classList.remove('app-flash-bg');
    }
  }, [paused, pausedFlash, themeName]);

  return null;
}
