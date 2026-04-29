// ============================================================
//  js/rooms.js — Fetching data from Express API
// ============================================================
import { fetchFromApi } from './api.js';
import { getUser, getDisplayEmail } from './auth.js';

export async function getAllRooms() {
  return await fetchFromApi('/rooms');
}

export async function getRoomById(id) {
  return await fetchFromApi(`/room/${id}`);
}

export async function getRoomStats() {
  return await fetchFromApi('/stats');
}

export async function updateRoomStatus(roomId, status, sessionInfo = null) {
  const user = await getUser();
  const userName = getDisplayEmail() || user?.email;

  return await fetchFromApi(`/room/${roomId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      sessionInfo,
      userId: user?.id,
      userName: userName
    })
  });
}

// Subscriptions are now handled by periodic polling in the dashboard
export function subscribeToRoomChanges(callback) {
  return { subscribe: () => {} };
}