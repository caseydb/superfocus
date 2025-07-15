import RoomPageClient from "./RoomPageClient";
import type { RoomPageParams } from "../types";

export default async function RoomPage({ params }: { params: Promise<RoomPageParams> }) {
  const { roomUrl } = await params;
  return <RoomPageClient roomUrl={roomUrl} />;
}
