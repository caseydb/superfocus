"use client";
import { InstanceProvider } from "../Components/Instances";
import RoomShell from "../Components/Room/RoomShell";
import type { RoomPageParams } from "../types";
import React from "react";

export default function RoomPage({ params }: { params: Promise<RoomPageParams> }) {
  const unwrappedParams = React.use(params);
  return (
    <InstanceProvider>
      <div className="min-h-screen flex items-center justify-center p-6">
        <RoomShell roomUrl={unwrappedParams.roomUrl} />
      </div>
    </InstanceProvider>
  );
}
