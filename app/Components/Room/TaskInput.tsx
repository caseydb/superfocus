"use client";
import React, { useState } from "react";

export default function TaskInput({ onLockIn }: { onLockIn: (task: string) => void }) {
  const [task, setTask] = useState("");
  const maxLen = 69;
  const chars = task.length;
  const minWidth = 650;
  const maxWidth = 800;
  const [inputWidth, setInputWidth] = useState(minWidth);
  const spanRef = React.useRef<HTMLSpanElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

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
      />
      {/* Custom underline with larger gap */}
      <div
        className={`mx-auto transition-colors duration-200` + (isFocused ? " bg-yellow-400" : " bg-gray-700")}
        style={{
          width: inputWidth,
          height: "2px",
          marginBottom: "20px",
          borderRadius: "2px",
        }}
      />
      <div className="text-gray-400 text-xl mb-4 text-center">
        {chars} / {maxLen}
      </div>
      <button
        className="bg-white text-black font-extrabold text-2xl px-12 py-4 rounded-xl shadow-lg transition hover:scale-105 disabled:opacity-40 mb-8"
        disabled={!task.trim() || chars > maxLen}
        onClick={() => onLockIn(task.trim())}
      >
        Start
      </button>
    </div>
  );
}
