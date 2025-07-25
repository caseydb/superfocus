export type PrivateRoom = {
  id: string;
  url: string;
  createdBy: string;
  createdAt: number;
  userCount: number;
  users?: Record<string, { id: string; displayName: string }>;
  pgRoomId?: string;
};

export type PrivateRoomFromDB = Omit<PrivateRoom, "id">;