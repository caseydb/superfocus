"use client";

import { InstanceProvider } from "./Components/Instances";
import Lobby from "./Components/Lobby";

export default function Home() {
  return (
    <InstanceProvider>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 p-6">
        <Lobby />
      </div>
    </InstanceProvider>
  );
}
