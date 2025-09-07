"use client";

import { Suspense } from "react";
import RoomShell from "../Components/Room/RoomShell";

export default function RoomPageClient({ roomUrl }: { roomUrl: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Suspense fallback={null}>
        <RoomShell roomUrl={roomUrl} />
      </Suspense>
    </div>
  );
}
