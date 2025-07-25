const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Function to parse duration string (mm:ss or hh:mm:ss) to seconds
function parseDurationToSeconds(durationStr) {
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

async function main() {
  try {
    // Read the test.json file
    const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'test.json'), 'utf8'));
    
    const userId = testData["task table ids"].user_id;
    const roomId = testData["task table ids"].room_id;
    
    console.log(`\n🔍 Importing data for:`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Room ID: ${roomId}`);
    
    // Check if user exists
    const userExists = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!userExists) {
      console.error(`\n❌ ERROR: User with id ${userId} does not exist!`);
      
      // Show available users
      const users = await prisma.user.findMany({
        select: { id: true, first_name: true, last_name: true, email: true },
        take: 5
      });
      
      console.log(`\n📋 Available users:`);
      users.forEach(u => {
        console.log(`   ${u.id} - ${u.first_name} ${u.last_name} (${u.email})`);
      });
      
      return;
    }
    
    console.log(`✅ User exists: ${userExists.first_name} ${userExists.last_name}`);
    
    // Check if room exists
    const roomExists = await prisma.room.findUnique({
      where: { id: roomId }
    });
    
    if (!roomExists) {
      console.error(`\n❌ ERROR: Room with id ${roomId} does not exist!`);
      
      // Show available rooms
      const rooms = await prisma.room.findMany({
        select: { id: true, name: true },
        take: 5
      });
      
      console.log(`\n📋 Available rooms:`);
      rooms.forEach(r => {
        console.log(`   ${r.id} - ${r.name}`);
      });
      
      return;
    }
    
    console.log(`✅ Room exists: ${roomExists.name}`);
    
    let completedCount = 0;
    let notStartedCount = 0;
    
    // Process user data
    for (const [firebaseUserId, userData] of Object.entries(testData.users)) {
      console.log(`\n📝 Processing Firebase user: ${firebaseUserId}`);
      
      // Import completion history (completed tasks)
      if (userData.completionHistory) {
        const entries = Object.entries(userData.completionHistory);
        console.log(`\n📥 Importing ${entries.length} completed tasks...`);
        
        for (const [historyId, entry] of entries) {
          try {
            const duration = parseDurationToSeconds(entry.duration);
            const completedAt = new Date(entry.timestamp);
            
            await prisma.task.create({
              data: {
                user_id: userId,
                room_id: roomId,
                task_name: entry.task,
                status: 'completed',
                duration: duration,
                completed_at: completedAt,
                created_at: completedAt,
                updated_at: completedAt,
                timezone: 'Pacific/Auckland'
              }
            });
            
            completedCount++;
            process.stdout.write('.');
            
          } catch (error) {
            console.error(`\n✗ Error importing ${historyId}:`, error.message);
          }
        }
      }
      
      // Import not started tasks
      if (userData.tasks) {
        const tasks = Object.entries(userData.tasks).filter(([_, task]) => !task.completed);
        console.log(`\n\n📥 Importing ${tasks.length} not started tasks...`);
        
        const now = new Date();
        
        for (const [taskId, task] of tasks) {
          try {
            await prisma.task.create({
              data: {
                user_id: userId,
                room_id: roomId,
                task_name: task.text,
                status: 'not_started',
                duration: 0,
                completed_at: null,
                created_at: now,
                updated_at: now,
                timezone: 'Pacific/Auckland',
                order: task.order
              }
            });
            
            notStartedCount++;
            process.stdout.write('.');
            
          } catch (error) {
            console.error(`\n✗ Error importing task ${taskId}:`, error.message);
          }
        }
      }
    }
    
    console.log(`\n\n✅ Import completed!`);
    console.log(`   📊 Completed tasks: ${completedCount}`);
    console.log(`   📋 Not started tasks: ${notStartedCount}`);
    console.log(`   📈 Total: ${completedCount + notStartedCount}`);
    
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);