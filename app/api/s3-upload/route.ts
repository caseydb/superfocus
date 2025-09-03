import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/lib/firebase";

// Environment variables are loaded from .env file

const s3Client = new S3Client({
  region: process.env.NEXT_PUBLIC_AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY || "",
  },
});

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

async function getUserIdFromToken(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized: No valid token found");
  }

  const token = authHeader.substring(7);
  
  // Verify the Firebase ID token
  const { getAuth } = await import("firebase-admin/auth");
  const { getApps, initializeApp, cert } = await import("firebase-admin/app");
  
  // Initialize Firebase Admin if not already initialized
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    return decodedToken.uid;
  } catch (error) {
    console.error("Error verifying token:", error);
    throw new Error("Unauthorized: Invalid token");
  }
}

async function uploadFileToS3(fileBuffer: Buffer, fileName: string, contentType: string) {
  const params = {
    Bucket: "nexus-profile-storage",
    Key: fileName,
    Body: fileBuffer,
    ContentType: contentType,
  };

  const command = new PutObjectCommand(params);
  await s3Client.send(command);
  return fileName;
}

export async function POST(request: Request) {
  try {
    // Get Firebase user ID from the authorization header
    const authHeader = request.headers.get("authorization");
    const firebaseUserId = await getUserIdFromToken(authHeader);
    
    // Get the user_id from PostgreSQL using Firebase auth_id
    let userId: string | undefined;
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/user-data`, {
        headers: {
          "authorization": authHeader || "",
        },
      });
      
      if (response.ok) {
        const userData = await response.json();
        userId = userData.user_id;
      }
    } catch (error) {
      console.error("Failed to get user_id from database:", error);
    }
    
    // If no user_id from database, use Firebase UID
    const userIdentifier = userId || firebaseUserId;
    
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "File must be uploaded." }, { status: 400 });
    }

    const fileSize = file.size;
    if (fileSize > MAX_FILE_SIZE) {
      console.error("File size exceeds the maximum limit:", fileSize);
      return NextResponse.json(
        { error: `File size exceeds the 5 MB limit. Uploaded file size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB.` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.type;
    const originalFileName = file.name || `upload-${Date.now()}`;
    const extension = originalFileName.split(".").pop();

    // Build a new filename that includes the user identifier
    const fileName = `user-${userIdentifier}-${Date.now()}.${extension}`;

    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(fileType)) {
      console.error("Invalid file type:", fileType);
      return NextResponse.json({ error: "Only JPEG, PNG, GIF, and WebP files are allowed." }, { status: 400 });
    }

    const uploadedFileName = await uploadFileToS3(buffer, fileName, fileType);

    return NextResponse.json({ success: true, fileName: uploadedFileName });
  } catch (error: unknown) {
    console.error("Error in S3 upload handler:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: "Something went wrong", details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "An unknown error occurred." }, { status: 500 });
  }
}