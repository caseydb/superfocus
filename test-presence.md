# Presence System Test Guide

## Console Logs to Expect

### 1. When Joining a Room:
```
[PresenceService] Created Presence session: <sessionId>
[PresenceService] Created RoomIndex entry for user: <userId>
[ActiveWorkers] Active workers: 0 []
[ActiveWorkers] Idle workers: 1 [{...}]
[ActiveWorkers] → State change detected via RoomIndex (not heartbeat!)
```

### 2. Every 30 Seconds (Heartbeat):
```
[PresenceService] Heartbeat update (Presence path only)
```
**Note:** You should NOT see ActiveWorkers logs during heartbeats!

### 3. When Starting Timer (Going Active):
```
[PresenceService] Active state CHANGED: false → true (updating RoomIndex)
[ActiveWorkers] Active workers: 1 [{...}]
[ActiveWorkers] Idle workers: 0 []
[ActiveWorkers] → State change detected via RoomIndex (not heartbeat!)
```

### 4. When Stopping Timer (Going Idle):
```
[PresenceService] Active state CHANGED: true → false (updating RoomIndex)
[ActiveWorkers] Active workers: 0 []
[ActiveWorkers] Idle workers: 1 [{...}]
[ActiveWorkers] → State change detected via RoomIndex (not heartbeat!)
```

### 5. When Timer is Running and You Click Start Again:
```
[PresenceService] Active state unchanged: true (skipping RoomIndex update)
```
**Note:** No ActiveWorkers update because nothing changed!

## Test Actions to Confirm:

1. **Join a room** - Verify initial logs show creation of both paths

2. **Wait 35 seconds without doing anything** - You should see:
   - One heartbeat log at 30 seconds
   - NO ActiveWorkers updates
   - NO "State change detected" logs

3. **Start your timer** - Verify:
   - "Active state CHANGED: false → true"
   - ActiveWorkers updates showing you as active

4. **Wait another 35 seconds with timer running** - You should see:
   - One heartbeat log
   - NO ActiveWorkers updates

5. **Click "Start" again while timer is running** - Verify:
   - "Active state unchanged: true (skipping RoomIndex update)"
   - NO ActiveWorkers updates

6. **Stop your timer** - Verify:
   - "Active state CHANGED: true → false"
   - ActiveWorkers updates showing you as idle

7. **Open a second browser tab** in the same room - Verify:
   - New session created
   - ActiveWorkers shows both tabs
   - Starting timer in one tab makes that user active

## What This Proves:

✅ **Heartbeats don't trigger UI updates** - Only updating Presence path
✅ **State changes are detected properly** - Only real changes update RoomIndex
✅ **Multiple tabs work correctly** - Each gets its own session
✅ **Performance is optimized** - ActiveWorkers only re-renders on real changes

## Firebase Console Check:

You can also verify in Firebase Console:
- `/Presence/{userId}/sessions/{sessionId}/lastSeen` - Updates every 30 seconds
- `/RoomIndex/{roomId}/{userId}/lastUpdated` - Only updates on state changes