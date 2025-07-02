"use client";

import { InstanceProvider } from "./Components/Instances";
import Lobby from "./Components/Lobby";

export default function Home() {
  return (
    <InstanceProvider>
      <div className="min-h-screen flex items-center justify-center p-6">
        <Lobby />
      </div>
    </InstanceProvider>
  );
}
