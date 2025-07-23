import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

interface CompletionHistoryEntry {
  displayName: string;
  duration: string;
  task: string;
  timestamp: number;
  userId: string;
}

interface TaskEntry {
  completed: boolean;
  order: number;
  text: string;
}

interface TestData {
  "task table ids": {
    user_id: string;
    room_id: string;
  };
  users: {
    [key: string]: {
      completionHistory?: {
        [key: string]: CompletionHistoryEntry;
      };
      tasks?: {
        [key: string]: TaskEntry;
      };
    };
  };
}

// Function to parse duration string (mm:ss or hh:mm:ss) to seconds
function parseDurationToSeconds(durationStr: string): number {
  const parts = durationStr.split(':').map(Number);
  if (parts.length === 2) {
    // mm:ss format
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  } else if (parts.length === 3) {
    // hh:mm:ss format
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
}

// Function to convert timestamp to Pacific/Auckland timezone
function convertToAucklandTime(timestamp: number): Date {
  // Create a date from the timestamp
  const date = new Date(timestamp);
  
  // Format to Auckland timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  const dateParts: { [key: string]: string } = {};
  
  parts.forEach(part => {
    if (part.type !== 'literal') {
      dateParts[part.type] = part.value;
    }
  });
  
  // Construct ISO string in Auckland time
  const isoString = `${dateParts.year}-${dateParts.month}-${dateParts.day}T${dateParts.hour}:${dateParts.minute}:${dateParts.second}.${dateParts.fractionalSecond || '000'}Z`;
  
  return new Date(isoString);
}

async function importTestData() {
  try {
    // Read the test.json file
    const testDataPath = path.join(__dirname, 'test.json');
    const testData: TestData = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));
    
    const userId = testData["task table ids"].user_id;
    const roomId = testData["task table ids"].room_id;
    
    
    // Check if user exists
    const userExists = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!userExists) {
      console.error(`\n❌ ERROR: User with id ${userId} does not exist in the database!`);
      console.error(`Please make sure this user exists before running the import.`);
      console.error(`\nYou may need to:`);
      console.error(`1. Update the user_id in test.json to match an existing user`);
      console.error(`2. Or create the user first in the database`);
      
      // Show available users
      const users = await prisma.user.findMany({
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true
        },
        take: 10
      });
      
      users.forEach(user => {
      });
      
      return;
    }
    
    
    // Check if room exists
    const roomExists = await prisma.room.findUnique({
      where: { id: roomId }
    });
    
    if (!roomExists) {
      console.error(`\n❌ ERROR: Room with id ${roomId} does not exist in the database!`);
      console.error(`Please make sure this room exists before running the import.`);
      return;
    }
    
    
    let completedTasksImported = 0;
    let notStartedTasksImported = 0;
    
    // Process each user's data
    for (const [firebaseUserId, userData] of Object.entries(testData.users)) {
      
      // Import completion history (completed tasks)
      if (userData.completionHistory) {
        
        for (const [historyId, entry] of Object.entries(userData.completionHistory)) {
          try {
            const durationSeconds = parseDurationToSeconds(entry.duration);
            const completedAt = convertToAucklandTime(entry.timestamp);
            
            await prisma.task.create({
              data: {
                user_id: userId,
                room_id: roomId,
                task_name: entry.task,
                status: 'completed',
                duration: durationSeconds,
                completed_at: completedAt,
                created_at: completedAt,
                updated_at: completedAt,
                timezone: 'Pacific/Auckland'
              }
            });
            
            completedTasksImported++;
            
          } catch (error) {
            console.error(`✗ Error importing completion history ${historyId}:`, error);
          }
        }
      }
      
      // Import tasks (not started)
      if (userData.tasks) {
        
        const nowAuckland = new Date();
        
        for (const [taskId, task] of Object.entries(userData.tasks)) {
          try {
            // Skip completed tasks in the tasks list
            if (task.completed) {
              continue;
            }
            
            await prisma.task.create({
              data: {
                user_id: userId,
                room_id: roomId,
                task_name: task.text,
                status: 'not_started',
                duration: 0,
                completed_at: null, // NULL for not started tasks
                created_at: nowAuckland,
                updated_at: nowAuckland,
                timezone: 'Pacific/Auckland'
              }
            });
            
            notStartedTasksImported++;
            
          } catch (error) {
            console.error(`✗ Error importing task ${taskId}:`, error);
          }
        }
      }
    }
    
    
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importTestData().catch(console.error);