export type PublicRoom = {
  id: string;
  url: string;
  name: string;
  createdBy: string;
  createdAt: number;
  userCount: number;
  users?: Record<string, { id: string; displayName: string }>;
};

export type PublicRoomFromDB = Omit<PublicRoom, "id">;