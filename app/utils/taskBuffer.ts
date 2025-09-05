export function taskBufferUserId(userId: string, isGuest?: boolean): string {
  if (!userId) return userId;
  return isGuest ? `guest-${userId}` : userId;
}

