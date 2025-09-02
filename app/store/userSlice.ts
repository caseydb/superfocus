import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { auth } from '@/lib/firebase';

interface UserState {
  user_id: string | null;
  auth_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  profile_image: string | null;
  timezone: string | null;
  first_visit: boolean;
  loading: boolean;
  error: string | null;
  isGuest: boolean;
}

const initialState: UserState = {
  user_id: null,
  auth_id: null,
  first_name: null,
  last_name: null,
  email: null,
  profile_image: null,
  timezone: null,
  first_visit: true,
  loading: false,
  error: null,
  isGuest: true, // Default to guest mode
};

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
    initializeGuestMode: (state) => {
      // Check if we already have a persisted guest ID and avatar
      let guestId = null;
      let guestAvatar = null;
      
      if (typeof window !== 'undefined') {
        guestId = localStorage.getItem('guest_id');
        guestAvatar = localStorage.getItem('guest_avatar');
      }
      
      // Generate new guest ID if needed
      if (!guestId) {
        guestId = `guest_${Math.random().toString(36).slice(2, 10)}`;
        if (typeof window !== 'undefined') {
          localStorage.setItem('guest_id', guestId);
        }
      }
      
      // Assign animal avatar - use persisted one or generate new
      if (!guestAvatar) {
        const animals = ['bear', 'owl', 'tiger', 'turtle', 'wolf'];
        const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
        guestAvatar = `/${randomAnimal}.png`;
        if (typeof window !== 'undefined') {
          localStorage.setItem('guest_avatar', guestAvatar);
        }
      }
      
      state.user_id = guestId;
      state.auth_id = guestId;
      state.isGuest = true;
      state.first_name = 'Guest';
      state.last_name = 'User';
      state.loading = false;
      state.error = null;
      state.profile_image = guestAvatar;
    },
    upgradeToAuthenticatedUser: (state, action: PayloadAction<{ firebaseUser: { uid: string; displayName?: string | null; email?: string | null } }>) => {
      state.auth_id = action.payload.firebaseUser.uid;
      state.email = action.payload.firebaseUser.email ?? null;
      state.isGuest = false;
      // Clear the animal avatar when upgrading to authenticated user
      state.profile_image = null;
      // Clear persisted guest data
      if (typeof window !== 'undefined') {
        localStorage.removeItem('guest_id');
        localStorage.removeItem('guest_avatar');
      }
      // Keep other fields until real data is fetched
    },
    setGuestWithAuth: (state, action: PayloadAction<{ firebaseUser: { uid: string; email?: string | null; displayName?: string | null; isAnonymous?: boolean } }>) => {
      // User is authenticated with Firebase but not synced to PostgreSQL
      state.auth_id = action.payload.firebaseUser.uid;
      state.email = action.payload.firebaseUser.email ?? null;
      state.isGuest = true; // Still guest because no PostgreSQL data
      state.first_name = action.payload.firebaseUser.displayName?.split(' ')[0] || 'Guest';
      state.last_name = action.payload.firebaseUser.displayName?.split(' ')[1] || 'User';
      
      // Only set animal avatar if they're truly anonymous (not a real user waiting for sync)
      if (action.payload.firebaseUser.isAnonymous) {
        const animals = ['bear', 'owl', 'tiger', 'turtle', 'wolf'];
        const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
        state.profile_image = `/${randomAnimal}.png`;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUserData.fulfilled, (state, action) => {
        state.loading = false;
        state.user_id = action.payload.user_id;
        state.auth_id = action.payload.auth_id;
        state.first_name = action.payload.first_name;
        state.last_name = action.payload.last_name;
        state.email = action.payload.email;
        state.profile_image = action.payload.profile_image;
        state.timezone = action.payload.timezone;
        state.first_visit = action.payload.first_visit ?? true;
        state.isGuest = false; // Successfully fetched user data means not a guest
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
        state.auth_id = action.payload.auth_id;
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

export const { 
  setUser, 
  updateUser, 
  clearUser, 
  initializeGuestMode, 
  upgradeToAuthenticatedUser, 
  setGuestWithAuth 
} = userSlice.actions;
export default userSlice.reducer;