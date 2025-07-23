import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    // Log environment status
    console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
    console.log('DATABASE_URL from env:', process.env.DATABASE_URL ? 'Present' : 'Missing');
    
    // Test basic database connection
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    
    return NextResponse.json({ 
      success: true, 
      message: 'Database connection successful',
      result,
      envCheck: {
        DATABASE_URL: !!process.env.DATABASE_URL,
        FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID
      }
    });
  } catch (error) {
    console.error('Database connection test failed:', error);
    
    return NextResponse.json({ 
      success: false, 
      error: 'Database connection failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      errorType: error?.constructor?.name,
      envCheck: {
        DATABASE_URL: !!process.env.DATABASE_URL,
        FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID
      },
      // Include more details for debugging
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}