"use client";
import React from "react";

export default function FlyingMessages({
  flyingMessages,
  flyingPlaceholders,
  activeWorkers,
}: {
  flyingMessages: { id: string; text: string; color: string; userId?: string }[];
  flyingPlaceholders: string[];
  activeWorkers: { name: string; userId: string }[];
}) {
  return (
    <div className="pointer-events-none fixed top-4 left-0 w-full z-50">
      {[...flyingMessages, ...flyingPlaceholders.map((id) => ({ id, text: "", color: "", userId: undefined }))].map(
        (msg, i) => {
          let rowIndex = 0;
          if (msg.userId) {
            const idx = activeWorkers.findIndex((w) => w.userId === msg.userId);
            if (idx !== -1) {
              rowIndex = idx;
            } else {
              rowIndex = activeWorkers.length;
            }
          } else {
            rowIndex = i;
          }
          return flyingMessages.find((m) => m.id === msg.id) ? (
            <div
              key={msg.id}
              className={`absolute left-0 top-0 font-mono text-base opacity-90 ${msg.color} animate-fly-across`}
              style={{ whiteSpace: "nowrap", top: `${rowIndex * 2.2}rem`, height: "2rem" }}
            >
              {msg.text}
            </div>
          ) : (
            <div
              key={msg.id}
              className="absolute left-0 font-mono text-base opacity-0"
              style={{ top: `${rowIndex * 2.2}rem`, height: "2rem" }}
            />
          );
        }
      )}
    </div>
  );
}
