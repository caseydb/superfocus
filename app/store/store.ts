import { configureStore } from '@reduxjs/toolkit';
import userReducer from './userSlice';
import taskReducer from './taskSlice';
import realtimeReducer from './realtimeSlice';
import notesReducer from './notesSlice';
import preferenceReducer from './preferenceSlice';
import historyReducer from './historySlice';
import leaderboardReducer from './leaderboardSlice';
import taskInputReducer from './taskInputSlice';
import timerReducer from './timerSlice';
import workspaceReducer from './workspaceSlice';

export const store = configureStore({
  reducer: {
    user: userReducer,
    tasks: taskReducer,
    realtime: realtimeReducer,
    notes: notesReducer,
    preferences: preferenceReducer,
    history: historyReducer,
    leaderboard: leaderboardReducer,
    taskInput: taskInputReducer,
    timer: timerReducer,
    workspace: workspaceReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;