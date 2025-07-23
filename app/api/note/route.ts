import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, items } = body;

    if (!taskId || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    // Use Prisma transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Delete existing notes for this task
      await tx.note.deleteMany({
        where: { task_id: taskId }
      });

      // Insert new notes one by one with upsert to handle potential ID conflicts
      for (const item of items) {
        await tx.note.create({
          data: {
            id: `${taskId}_${item.id}`, // Prefix with taskId to ensure uniqueness
            task_id: taskId,
            type: item.type,
            content_text: item.content,
            checklist_completed: item.type === 'checkbox' ? (item.completed || false) : false,
            position: item.index
          }
        });
      }
    });

    return NextResponse.json({ success: true, message: 'Notes saved successfully' });
  } catch (error) {
    console.error('POST /api/note error:', error);
    return NextResponse.json(
      { error: 'Failed to save notes', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }

    const notes = await prisma.note.findMany({
      where: { task_id: taskId },
      orderBy: { position: 'asc' }
    });

    const items = notes.map(note => ({
      id: note.id.replace(`${taskId}_`, ''), // Remove taskId prefix to get original ID
      type: note.type,
      content: note.content_text,
      level: 0, // You may want to add a level column to your table
      index: note.position,
      ...(note.type === 'checkbox' && { completed: note.checklist_completed })
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error('GET /api/note error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notes', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}