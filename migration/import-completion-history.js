const fs = require('fs');
const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Read the test.json file
const testData = JSON.parse(fs.readFileSync('./test.json', 'utf8'));

// Database connection - update these with your actual credentials
const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/dbname'
});

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

// Function to convert timestamp to Pacific/Auckland timezone
function convertToAucklandTime(timestamp) {
  // Create a date from the timestamp
  const date = new Date(timestamp);
  
  // Convert to Auckland timezone string
  // Note: PostgreSQL will store this as UTC internally, but we're converting
  // the timestamp to what it would be in Auckland time
  const aucklandTime = new Date(date.toLocaleString("en-US", {timeZone: "Pacific/Auckland"}));
  
  return aucklandTime.toISOString();
}

async function importCompletionHistory() {
  try {
    // Connect to database
    await client.connect();

    // Get room_id and user_id mapping from the test data
    const defaultUserId = testData["task table"].user_id;
    const roomId = testData["task table"].room_id;

    let totalImported = 0;

    // Process each user's completion history
    for (const [firebaseUserId, userData] of Object.entries(testData.users)) {
      if (userData.completionHistory) {
        
        for (const [historyId, entry] of Object.entries(userData.completionHistory)) {
          try {
            // Generate a new UUID for the task
            const taskId = uuidv4();
            
            // Parse duration to seconds
            const durationSeconds = parseDurationToSeconds(entry.duration);
            
            // Convert timestamp to Auckland time
            const completedAt = convertToAucklandTime(entry.timestamp);
            const createdAt = completedAt; // Using same timestamp for created_at
            const updatedAt = completedAt; // Using same timestamp for updated_at
            
            // Insert into task table
            const query = `
              INSERT INTO task (
                id, 
                user_id, 
                room_id, 
                task_name, 
                status, 
                duration, 
                completed_at, 
                created_at, 
                updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `;
            
            const values = [
              taskId,
              defaultUserId, // Using the PostgreSQL user_id from test.json
              roomId,
              entry.task,
              'completed', // Since these are from completionHistory
              durationSeconds,
              completedAt,
              createdAt,
              updatedAt
            ];
            
            await client.query(query, values);
            totalImported++;
            
            
          } catch (error) {
            console.error(`Error importing entry ${historyId}:`, error.message);
          }
        }
      }
    }
    
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

// Run the import
importCompletionHistory();