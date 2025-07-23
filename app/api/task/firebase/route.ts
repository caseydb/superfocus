import { NextRequest, NextResponse } from "next/server";
import { rtdb } from "@/lib/firebase";
import { ref, set, get, update, remove } from "firebase/database";

// Firebase TaskBuffer operations
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const firebaseUserId = searchParams.get("userId");
    const taskId = searchParams.get("taskId");

    if (!firebaseUserId) {
      return NextResponse.json(
        { error: "Firebase user ID is required" },
        { status: 400 }
      );
    }

    if (taskId) {
      // Get specific task
      const taskRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/${taskId}`);
      const snapshot = await get(taskRef);

      if (!snapshot.exists()) {
        return NextResponse.json(
          { error: "Task not found in TaskBuffer" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        task: snapshot.val()
      });
    } else {
      // Get all tasks for the user
      const userTasksRef = ref(rtdb, `TaskBuffer/${firebaseUserId}`);
      const snapshot = await get(userTasksRef);

      if (!snapshot.exists()) {
        return NextResponse.json({
          success: true,
          tasks: []
        });
      }

      const userTasks = snapshot.val();
      const tasks = Object.entries(userTasks)
        .filter(([key]) => key !== 'timer_state' && key !== 'heartbeat' && key !== 'tasks' && key !== 'rooms') // Filter out non-task entries
        .map(([id, data]) => ({
          id,
          ...data as object
        }));

      return NextResponse.json({
        success: true,
        count: tasks.length,
        tasks
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch tasks from Firebase" },
      { status: 500 }
    );
  }
}

// Create or update task in TaskBuffer
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      firebaseUserId,
      name,
      user_id,
      room_id,
      status = "not_started",
      time_segments = []
    } = body;

    if (!id || !firebaseUserId || !name || !user_id || !room_id) {
      return NextResponse.json(
        { 
          error: "Missing required fields",
          required: ["id", "firebaseUserId", "name", "user_id", "room_id"]
        },
        { status: 400 }
      );
    }

    const taskRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/${id}`);
    
    const taskData = {
      id,
      name,
      user_id,
      room_id,
      status,
      created_at: Date.now(),
      total_time: 0,
      time_segments,
      updated_at: Date.now()
    };

    await set(taskRef, taskData);

    return NextResponse.json({
      success: true,
      task: taskData,
      message: "Task created in TaskBuffer"
    });

  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create task in Firebase" },
      { status: 500 }
    );
  }
}

// Update task in TaskBuffer
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, firebaseUserId, ...updateData } = body;

    if (!id || !firebaseUserId) {
      return NextResponse.json(
        { error: "Task ID and Firebase user ID are required" },
        { status: 400 }
      );
    }

    const taskRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/${id}`);
    
    // Add updated timestamp
    updateData.updated_at = Date.now();

    await update(taskRef, updateData);

    // Get updated task
    const snapshot = await get(taskRef);
    
    return NextResponse.json({
      success: true,
      task: snapshot.val(),
      message: "Task updated in TaskBuffer"
    });

  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update task in Firebase" },
      { status: 500 }
    );
  }
}

// Delete task from TaskBuffer
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const firebaseUserId = searchParams.get("userId");

    if (!id || !firebaseUserId) {
      return NextResponse.json(
        { error: "Task ID and Firebase user ID are required" },
        { status: 400 }
      );
    }

    const taskRef = ref(rtdb, `TaskBuffer/${firebaseUserId}/${id}`);
    await remove(taskRef);

    return NextResponse.json({
      success: true,
      message: "Task removed from TaskBuffer"
    });

  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete task from Firebase" },
      { status: 500 }
    );
  }
}