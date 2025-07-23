import { NextResponse } from 'next/server';

export async function GET() {
  // Only show in non-production or with a secret query param
  const isDev = process.env.NODE_ENV !== 'production';
  
  return NextResponse.json({
    environment: process.env.NODE_ENV,
    hasRequiredEnvVars: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
      FIREBASE_PRIVATE_KEY_LENGTH: process.env.FIREBASE_PRIVATE_KEY?.length || 0
    },
    // Only show in dev
    ...(isDev && {
      dbUrlStart: process.env.DATABASE_URL?.substring(0, 30) + '...',
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID
    })
  });
}