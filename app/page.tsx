"use client";

import RoomPageClient from "./[roomUrl]/RoomPageClient";

export default function Home() {
  // Base URL loads as "gsd" (Get Sh!t Done) room
  return <RoomPageClient roomUrl="gsd" />;
}
