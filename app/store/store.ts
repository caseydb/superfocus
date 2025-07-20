import { configureStore } from '@reduxjs/toolkit';
import userReducer from './userSlice';
import taskReducer from './taskSlice';
import realtimeReducer from './realtimeSlice';

export const store = configureStore({
  reducer: {
    user: userReducer,
    tasks: taskReducer,
    realtime: realtimeReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;