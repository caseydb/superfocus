import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  console.log("🧪 Test endpoint called");
  return NextResponse.json({ 
    message: "Test endpoint working",
    timestamp: new Date().toISOString(),
    headers: {
      authorization: req.headers.get("authorization"),
      contentType: req.headers.get("content-type"),
    }
  });
}

export async function POST(req: NextRequest) {
  console.log("🧪 Test POST endpoint called");
  const body = await req.json().catch(() => null);
  return NextResponse.json({ 
    message: "Test POST endpoint working",
    timestamp: new Date().toISOString(),
    body: body,
    headers: {
      authorization: req.headers.get("authorization"),
      contentType: req.headers.get("content-type"),
    }
  });
}