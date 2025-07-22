import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { auth } from '@/lib/firebase';

interface UserState {
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  profile_image: string | null;
  timezone: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: UserState = {
  user_id: null,
  first_name: null,
  last_name: null,
  email: null,
  profile_image: null,
  timezone: null,
  loading: false,
  error: null,
};

console.log("[USER_SLICE] Initial state created:", initialState);

export const fetchUserData = createAsyncThunk(
  'user/fetchUserData',
  async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No authenticated user');
    }

    const token = await currentUser.getIdToken();
    
    const response = await fetch('/api/redux/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user data');
    }

    return await response.json();
  }
);

export const updateUserData = createAsyncThunk(
  'user/updateUserData',
  async (userData: { first_name?: string; last_name?: string; timezone?: string }) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No authenticated user');
    }

    const token = await currentUser.getIdToken();
    
    const response = await fetch('/api/redux/user', {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      throw new Error('Failed to update user data');
    }

    return await response.json();
  }
);


const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<Omit<UserState, 'loading' | 'error'>>) => {
      return { ...action.payload, loading: false, error: null };
    },
    updateUser: (state, action: PayloadAction<Partial<UserState>>) => {
      return { ...state, ...action.payload };
    },
    clearUser: () => {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUserData.fulfilled, (state, action) => {
        console.log("[USER_SLICE] fetchUserData.fulfilled - Setting user state:", action.payload);
        state.loading = false;
        state.user_id = action.payload.user_id;
        state.first_name = action.payload.first_name;
        state.last_name = action.payload.last_name;
        state.email = action.payload.email;
        state.profile_image = action.payload.profile_image;
        state.timezone = action.payload.timezone;
      })
      .addCase(fetchUserData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch user data';
      })
      .addCase(updateUserData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateUserData.fulfilled, (state, action) => {
        state.loading = false;
        state.user_id = action.payload.user_id;
        state.first_name = action.payload.first_name;
        state.last_name = action.payload.last_name;
        state.email = action.payload.email;
        state.profile_image = action.payload.profile_image;
        state.timezone = action.payload.timezone;
      })
      .addCase(updateUserData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to update user data';
      })
  },
});

export const { setUser, updateUser, clearUser } = userSlice.actions;
export default userSlice.reducer;