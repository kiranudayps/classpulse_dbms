// ============================================================
//  js/scheduler.js — MySQL specific wrapper
//  Most logic moved safely to the DB Event: evt_sync_room_status
// ============================================================

export function initScheduler() {
  console.log('[Scheduler] Backend MySQL Event handles status sync automatically.');
}

export async function forceSyncIfAdmin() {
  console.log('[Scheduler] Manual forcing sync not needed, system polling active.');
}
