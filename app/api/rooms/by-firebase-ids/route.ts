import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

interface RoomMetadata {
  name: string;
  slug: string;
  description?: string;
}

const normalizeIdentifier = (value: string): string => value.trim().replace(/^\/+/, "").toLowerCase();

const extractIdentifiers = (values: string[]): string[] => {
  const identifiers = new Set<string>();

  values.forEach((raw) => {
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => identifiers.add(entry));
  });

  return Array.from(identifiers);
};

const resolveRoomMetadata = async (identifiers: string[]): Promise<Record<string, RoomMetadata>> => {
  const originalCandidates = Array.from(new Set(identifiers.map((id) => id.trim()).filter(Boolean)));
  const normalizedCandidates = Array.from(new Set(originalCandidates.map((id) => normalizeIdentifier(id))));

  if (originalCandidates.length === 0) {
    return {};
  }

  const orConditions: Prisma.roomWhereInput[] = [];

  if (originalCandidates.length) {
    orConditions.push({ firebase_id: { in: originalCandidates } });
  }

  if (normalizedCandidates.length) {
    orConditions.push({ firebase_id: { in: normalizedCandidates } });
    orConditions.push({ slug: { in: normalizedCandidates } });
  }

  const rooms = await prisma.room.findMany({
    where: {
      type: "public",
      OR: orConditions,
    },
    select: {
      slug: true,
      name: true,
      description: true,
      firebase_id: true,
    },
  });

  if (!rooms.length) {
    return {};
  }

  const metadataByIdentifier: Record<string, RoomMetadata> = {};

  const getRoomPayload = (room: (typeof rooms)[number]): RoomMetadata => ({
    name: room.name,
    slug: room.slug,
    description: room.description ?? undefined,
  });

  for (const identifier of originalCandidates) {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized || metadataByIdentifier[normalized]) {
      continue;
    }

    const matchingRoom = rooms.find((room) => {
      const normalizedSlug = normalizeIdentifier(room.slug);
      const normalizedFirebaseId = room.firebase_id ? normalizeIdentifier(room.firebase_id) : null;

      return (
        normalizedSlug === normalized ||
        (normalizedFirebaseId !== null && normalizedFirebaseId === normalized) ||
        (room.firebase_id !== null && room.firebase_id.trim() === identifier.trim())
      );
    });

    if (matchingRoom) {
      metadataByIdentifier[normalized] = getRoomPayload(matchingRoom);
    }
  }

  return metadataByIdentifier;
};

const getFirebaseIdsFromQuery = (request: NextRequest): string[] => {
  const searchParams = request.nextUrl.searchParams;
  const candidates: string[] = [];

  const paramKeys = ["firebaseId", "firebaseIds", "id", "ids"];
  for (const key of paramKeys) {
    const values = searchParams.getAll(key);
    if (values.length) {
      candidates.push(...values);
    }
  }

  return extractIdentifiers(candidates);
};

const getFirebaseIdsFromBody = async (request: NextRequest): Promise<string[]> => {
  try {
    const data = await request.json();
    if (Array.isArray(data)) {
      return extractIdentifiers(data);
    }

    if (data && Array.isArray(data.firebaseIds)) {
      return extractIdentifiers(data.firebaseIds);
    }

    return [];
  } catch {
    return [];
  }
};

export async function GET(request: NextRequest) {
  try {
    const identifiers = getFirebaseIdsFromQuery(request);
    if (!identifiers.length) {
      return NextResponse.json({ rooms: {} });
    }

    const rooms = await resolveRoomMetadata(identifiers);
    return NextResponse.json({ rooms });
  } catch (error) {
    console.error("[rooms/by-firebase-ids][GET] Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const identifiers = await getFirebaseIdsFromBody(request);
    if (!identifiers.length) {
      return NextResponse.json({ rooms: {} });
    }

    const rooms = await resolveRoomMetadata(identifiers);
    return NextResponse.json({ rooms });
  } catch (error) {
    console.error("[rooms/by-firebase-ids][POST] Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
