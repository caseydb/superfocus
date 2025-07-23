import { NextRequest, NextResponse } from "next/server";
import { rtdb } from "@/lib/firebase";
import { ref, get } from "firebase/database";

// Debug endpoint to check TaskBuffer status
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (userId) {
      // Check specific user's TaskBuffer
      const userRef = ref(rtdb, `TaskBuffer/${userId}`);
      const snapshot = await get(userRef);
      
      if (!snapshot.exists()) {
        return NextResponse.json({
          message: "User has no data in TaskBuffer - CLEAN!",
          userId,
          hasData: false,
          data: null
        });
      }
      
      const userData = snapshot.val();
      const keys = Object.keys(userData);
      const taskKeys = keys.filter(key => 
        key !== 'timer_state' && 
        key !== 'heartbeat' && 
        key !== 'tasks' && 
        key !== 'rooms' &&
        key !== 'completionHistory' &&
        key !== 'lastStartSound' &&
        key !== 'lastCompleteSound' &&
        key !== 'history' &&
        key !== 'lastEvent'
      );
      
      return NextResponse.json({
        message: "User has data in TaskBuffer",
        userId,
        hasData: true,
        totalKeys: keys.length,
        taskCount: taskKeys.length,
        nonTaskKeys: keys.filter(k => !taskKeys.includes(k)),
        data: userData
      });
    } else {
      // Check entire TaskBuffer
      const taskBufferRef = ref(rtdb, `TaskBuffer`);
      const snapshot = await get(taskBufferRef);
      
      if (!snapshot.exists()) {
        return NextResponse.json({
          message: "TaskBuffer is completely EMPTY - SUCCESS!",
          isEmpty: true,
          userCount: 0,
          data: null
        });
      }
      
      const allData = snapshot.val();
      const userIds = Object.keys(allData);
      
      const userSummary = userIds.map(uid => {
        const userData = allData[uid];
        const keys = Object.keys(userData);
        const taskKeys = keys.filter(key => 
          key !== 'timer_state' && 
          key !== 'heartbeat' && 
          key !== 'tasks' && 
          key !== 'rooms' &&
          key !== 'completionHistory' &&
          key !== 'lastStartSound' &&
          key !== 'lastCompleteSound' &&
          key !== 'history' &&
          key !== 'lastEvent'
        );
        
        return {
          userId: uid,
          totalKeys: keys.length,
          taskCount: taskKeys.length,
          nonTaskKeys: keys.filter(k => !taskKeys.includes(k))
        };
      });
      
      return NextResponse.json({
        message: "TaskBuffer contains data",
        isEmpty: false,
        userCount: userIds.length,
        users: userSummary,
        data: allData
      });
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to check TaskBuffer" },
      { status: 500 }
    );
  }
}