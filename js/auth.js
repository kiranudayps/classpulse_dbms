// ============================================================
//  js/auth.js — with local API
// ============================================================
import { fetchFromApi } from './api.js';

export async function getUser() {
  const userJson = localStorage.getItem('classpulse_user');
  return userJson ? JSON.parse(userJson) : null;
}

export async function getUserRole() {
  const user = await getUser();
  return user ? user.role : 'student';
}

export function getDisplayEmail() {
  return localStorage.getItem('staff_display_email') || null;
}

export function getDashboardUrl(email) {
  const e = (email || '').toLowerCase();
  if (/^cr[._@]/.test(e) || e.includes('.cr@') || e.includes('cr.nie')) {
    return '/pages/user-dashboard.html?role=cr';
  }
  return '/pages/user-dashboard.html?role=teacher';
}

export async function login(email, password) {
  const data = await fetchFromApi('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  if (data.user) {
    localStorage.setItem('classpulse_user', JSON.stringify(data.user));
    localStorage.setItem('staff_display_email', data.user.email);
    return data;
  }
  return null;
}

export async function logout() {
  localStorage.removeItem('classpulse_user');
  localStorage.removeItem('staff_display_email');
  window.location.href = '/';
}