"use client";

import RoomShell from "../Components/Room/RoomShell";

export default function RoomPageClient({ roomUrl }: { roomUrl: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <RoomShell roomUrl={roomUrl} />
    </div>
  );
}