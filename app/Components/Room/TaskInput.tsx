"use client";
import React from "react";

const maxLen = 69;

export default function TaskInput({
  task,
  setTask,
  disabled,
  onStart,
}: {
  task: string;
  setTask: (t: string) => void;
  disabled: boolean;
  onStart?: () => void;
}) {
  const chars = task.length;
  const [inputWidth, setInputWidth] = React.useState("95%");
  const spanRef = React.useRef<HTMLSpanElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = React.useState(false);
  const [showLimitPopup, setShowLimitPopup] = React.useState(false);

  const updateInputWidth = React.useCallback(() => {
    if (spanRef.current && typeof window !== "undefined") {
      const screenWidth = window.innerWidth;
      if (screenWidth >= 640) {
        // Desktop: use calculated width
        const minWidth = 650;
        const maxWidth = 800;
        const width = Math.min(Math.max(spanRef.current.offsetWidth + 40, minWidth), maxWidth);
        setInputWidth(`${width}px`);
      } else {
        // Mobile: use wider responsive width to fit placeholder
        setInputWidth("95%");
      }
    }
  }, []);

  React.useEffect(() => {
    updateInputWidth();
  }, [task, updateInputWidth]);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const handleResize = () => updateInputWidth();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, [updateInputWidth]);

  // Helper to recalculate textarea height
  const recalculateHeight = React.useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, []);

  React.useEffect(() => {
    recalculateHeight();
  }, [task, inputWidth, recalculateHeight]);

  // Add resize listener to handle responsive text size changes
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const handleResize = () => {
        // Add a small delay to ensure CSS changes have been applied
        setTimeout(recalculateHeight, 50);
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, [recalculateHeight]);

  React.useEffect(() => {
    if (chars >= maxLen) {
      setShowLimitPopup(true);
    }
  }, [chars]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full px-4 sm:px-0">
      <span
        ref={spanRef}
        className="invisible absolute whitespace-pre text-3xl md:text-4xl font-semibold px-4"
        style={{ pointerEvents: "none" }}
      >
        {task || "What are you focusing on?"}
      </span>
      <textarea
        ref={textareaRef}
        value={task}
        onChange={(e) => setTask(e.target.value.slice(0, maxLen))}
        maxLength={maxLen}
        className={`text-center text-3xl md:text-5xl font-semibold outline-none text-white mb-6 leading-tight mx-auto overflow-hidden resize-none transition-all duration-200 ${
          disabled ? "cursor-not-allowed" : "bg-transparent"
        }`}
        placeholder="What are you focusing on?"
        autoFocus
        rows={1}
        style={{ width: inputWidth }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !disabled) {
            e.preventDefault();
            if (onStart) onStart();
          }
        }}
      />
      {/* Custom underline with larger gap */}
      <div
        className={`mx-auto transition-colors duration-200${isFocused && !disabled ? "" : " bg-gray-700"}`}
        style={{
          width: inputWidth,
          height: "2px",
          marginBottom: "50px",
          borderRadius: "2px",
          background: isFocused && !disabled ? "#FFAA00" : undefined,
        }}
      />
      {showLimitPopup && (
        <div className="fixed top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-red-600 text-white text-3xl font-extrabold px-12 py-8 rounded-2xl shadow-2xl flex flex-col items-center gap-6 border-4 border-red-600">
          <span>Be compendious!</span>
          <button
            className="bg-white text-red-700 font-bold text-lg px-6 py-2 rounded shadow hover:bg-red-100 transition"
            onClick={() => setShowLimitPopup(false)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
