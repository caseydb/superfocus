import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

interface RoomMember {
  id: string;
  name: string;
  avatar: string;
  status: "online" | "idle" | "offline";
  task?: string;
  profileImage?: string | null;
  firstName?: string;
  lastName?: string;
  authId?: string;
}

interface Room {
  id: string;
  name: string;
  url: string;
  type: 'public' | 'private';
  firebaseId?: string;
  members?: RoomMember[];
  activeCount: number;
  weeklyStats: {
    totalTime: string;
    totalTasks: number;
  };
  description?: string;
  createdBy: string;
  isPinned?: boolean;
  isOwner?: boolean;
  isAdmin?: boolean;
  admins?: string[];
  maxMembers?: number;
  isEphemeral?: boolean;
  createdAt?: number;
}

interface RoomStats {
  [roomId: string]: {
    totalTime: string;
    totalTasks: number;
    activeUsers: number;
  };
}

interface WorkspaceState {
  rooms: Room[];
  roomStats: RoomStats;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

const initialState: WorkspaceState = {
  rooms: [],
  roomStats: {},
  loading: false,
  error: null,
  lastFetched: null,
};

// Async thunk to fetch workspace data
export const fetchWorkspace = createAsyncThunk(
  'workspace/fetch',
  async (_, { getState }) => {
    const state = getState() as { user: { user_id: string } };
    const userId = state.user.user_id;
    
    if (!userId) {
      throw new Error('User not authenticated');
    }
    
    const response = await fetch(`/api/workspace?userId=${userId}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch workspace');
    }
    
    return data;
  }
);

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    updateRoomStats: (state, action: PayloadAction<{ roomId: string; stats: { totalTime: string; totalTasks: number; activeUsers: number } }>) => {
      state.roomStats[action.payload.roomId] = action.payload.stats;
    },
    addRoom: (state, action: PayloadAction<Room>) => {
      state.rooms.push(action.payload);
    },
    removeRoom: (state, action: PayloadAction<string>) => {
      state.rooms = state.rooms.filter(room => room.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWorkspace.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWorkspace.fulfilled, (state, action) => {
        state.loading = false;
        state.rooms = action.payload.rooms || [];
        state.roomStats = action.payload.roomStats || {};
        state.lastFetched = Date.now();
      })
      .addCase(fetchWorkspace.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch workspace';
      });
  },
});

export const { updateRoomStats, addRoom, removeRoom } = workspaceSlice.actions;
export default workspaceSlice.reducer;