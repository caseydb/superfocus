// Shared types for the app

export type InstanceType = "public" | "private";

export type User = {
  id: string;
  displayName: string;
  isPremium: boolean;
};

export type Instance = {
  id: string;
  type: InstanceType;
  users: User[];
  createdBy: string;
  url: string;
};

export type RoomPageParams = { roomUrl: string };

export type InstanceFromDB = Omit<Instance, "id" | "users"> & { users?: Record<string, User> };

export type InstanceContextType = {
  instances: Instance[];
  currentInstance: Instance | null;
  joinInstance: (instanceId: string) => void;
  createInstance: (type: InstanceType) => void;
  leaveInstance: () => void;
};

export type InstanceProviderProps = {
  children: React.ReactNode;
};
