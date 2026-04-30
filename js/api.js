// ============================================================
//  js/api.js — Local API client replacing Supabase
// ============================================================

const API_BASE = '/api';

export async function fetchFromApi(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`[API] Error calling ${endpoint}:`, error);
    throw error;
  }
}
