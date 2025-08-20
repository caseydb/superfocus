import { auth } from "@/lib/firebase";

/**
 * Updates the user's last_active timestamp in PostgreSQL
 * Called when user performs significant actions (start/complete/create tasks)
 * Fails silently to not interrupt user flow
 */
export async function updateUserActivity() {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const token = await currentUser.getIdToken();
    
    // Fire and forget - don't await
    fetch('/api/user/update-activity', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }).catch(() => {
      // Silent fail - activity tracking should not break the app
    });
  } catch {
    // Silent fail
  }
}