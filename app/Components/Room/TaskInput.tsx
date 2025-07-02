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
  const minWidth = 650;
  const maxWidth = 800;
  const [inputWidth, setInputWidth] = React.useState(minWidth);
  const spanRef = React.useRef<HTMLSpanElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = React.useState(false);
  const [showLimitPopup, setShowLimitPopup] = React.useState(false);

  React.useEffect(() => {
    if (spanRef.current) {
      const width = Math.min(Math.max(spanRef.current.offsetWidth + 40, minWidth), maxWidth);
      setInputWidth(width);
    }
  }, [task]);

  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [task, inputWidth]);

  React.useEffect(() => {
    if (chars >= maxLen) {
      setShowLimitPopup(true);
    }
  }, [chars]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
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
        className="text-center text-3xl md:text-5xl font-semibold bg-transparent outline-none text-white mb-6 placeholder-gray-500 leading-tight mx-auto overflow-hidden resize-none"
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
        className={`mx-auto transition-colors duration-200${isFocused ? " bg-yellow-400" : " bg-gray-700"}`}
        style={{
          width: inputWidth,
          height: "2px",
          marginBottom: "50px",
          borderRadius: "2px",
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
