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
  "task table": {
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
    
    const userId = testData["task table"].user_id;
    const roomId = testData["task table"].room_id;
    
    console.log(`Using user_id: ${userId}`);
    console.log(`Using room_id: ${roomId}`);
    
    let completedTasksImported = 0;
    let notStartedTasksImported = 0;
    
    // Process each user's data
    for (const [firebaseUserId, userData] of Object.entries(testData.users)) {
      console.log(`\nProcessing Firebase user: ${firebaseUserId}`);
      
      // Import completion history (completed tasks)
      if (userData.completionHistory) {
        console.log('\nImporting completion history...');
        
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
            console.log(`✓ Imported completed task: "${entry.task}" (${entry.duration} = ${durationSeconds}s)`);
            
          } catch (error) {
            console.error(`✗ Error importing completion history ${historyId}:`, error);
          }
        }
      }
      
      // Import tasks (not started)
      if (userData.tasks) {
        console.log('\nImporting not started tasks...');
        
        const nowAuckland = new Date();
        
        for (const [taskId, task] of Object.entries(userData.tasks)) {
          try {
            // Skip completed tasks in the tasks list
            if (task.completed) {
              console.log(`⚠️  Skipping task "${task.text}" - marked as completed in tasks list`);
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
            console.log(`✓ Imported not started task: "${task.text}"`);
            
          } catch (error) {
            console.error(`✗ Error importing task ${taskId}:`, error);
          }
        }
      }
    }
    
    console.log('\n========================================');
    console.log('Import Summary:');
    console.log(`✓ Completed tasks imported: ${completedTasksImported}`);
    console.log(`✓ Not started tasks imported: ${notStartedTasksImported}`);
    console.log(`✓ Total tasks imported: ${completedTasksImported + notStartedTasksImported}`);
    console.log('========================================\n');
    
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importTestData().catch(console.error);