// ============================================================
//  js/dashboard.js  —  Fixed: realtime, floor tabs, staff label
// ============================================================
import { initScheduler }                                    from './scheduler.js';
import { getAllRooms, getRoomStats, subscribeToRoomChanges } from './rooms.js';
import { getUser, getDisplayEmail, logout }                  from './auth.js';

const grid           = document.getElementById('room-grid');
const statsTotal     = document.getElementById('stat-total');
const statsVacant    = document.getElementById('stat-vacant');
const statsOccupied  = document.getElementById('stat-occupied');
const roomCount      = document.getElementById('room-count');
const searchInput    = document.getElementById('search-input');
const searchBtn      = document.getElementById('search-btn');
const filterBuilding = document.getElementById('filter-building');
const filterStatus   = document.getElementById('filter-status');
const authBtn        = document.getElementById('auth-btn');
const userGreeting   = document.getElementById('user-greeting');
const todayLabel     = document.getElementById('today-label');

let allRoomsCache  = [];
let activeFloor    = 'all'; // 'all' | 'Ground Floor' | '1st Floor' | '2nd Floor' | '3rd Floor'

function floorLabel(room_number) {
  const n = String(room_number);
  if (n.startsWith('MB')) return 'Ground Floor';
  if (n.startsWith('1'))  return 'Ground Floor';
  if (n.startsWith('2'))  return '1st Floor';
  if (n.startsWith('3'))  return '2nd Floor';
  if (n.startsWith('4'))  return '3rd Floor';
  return '';
}

async function init() {
  if (todayLabel) {
    todayLabel.textContent = new Date().toLocaleDateString('en-IN', {
      weekday:'long', day:'numeric', month:'long'
    });
  }
  await loadUser();
  await loadRooms();
  await loadStats();
  initScheduler();
  bindEvents();
  listenRealtime();
}

async function loadUser() {
  const user = await getUser();
  if (user) {
    const displayEmail = getDisplayEmail() || user.email;
    if (userGreeting) userGreeting.textContent = `${displayEmail} · Logged In`;
    if (authBtn) {
      authBtn.textContent = 'Logout';
      authBtn.onclick = e => { e.preventDefault(); logout(); };
    }

    // Determine role
    const e = (displayEmail || '').toLowerCase();
    const isCR = /^cr[._@]/.test(e) || e.includes('.cr@') || e.includes('cr.nie');
    const dashUrl = `/pages/user-dashboard.html?role=${isCR ? 'cr' : 'teacher'}`;

    // Desktop: show My Dashboard link
    const dashLink = document.getElementById('dashboard-link');
    if (dashLink) {
      dashLink.style.display = 'flex';
      dashLink.href = dashUrl;
    }

    // Mobile header: person icon → go to dashboard instead of login
    const mobHeaderPerson = document.querySelector('.mob-header-person');
    if (mobHeaderPerson) mobHeaderPerson.href = dashUrl;

    // Mobile bottom nav: swap Login → My Page
    const mobLogin = document.getElementById('mob-login');
    const mobDash  = document.getElementById('mob-dashboard');
    if (mobLogin) mobLogin.style.display = 'none';
    if (mobDash) {
      mobDash.style.display = 'flex';
      mobDash.href = dashUrl;
    }

    // Desktop: show Pre-Book a Class button
    const prebookBtn = document.getElementById('prebook-btn');
    if (prebookBtn) prebookBtn.style.display = 'flex';
  }
}

async function loadStats() {
  try {
    const s = await getRoomStats();
    animateCount(statsTotal,    s.total);
    animateCount(statsVacant,   s.vacant);
    animateCount(statsOccupied, s.occupied);
  } catch(e) { console.error(e); }
}

function animateCount(el, target) {
  if (!el) return;
  let c = 0;
  const step = Math.ceil(target / 30);
  const t = setInterval(() => {
    c = Math.min(c + step, target);
    el.textContent = c;
    if (c >= target) clearInterval(t);
  }, 30);
}

async function loadRooms(rooms = null) {
  grid.innerHTML = '<div class="col-span-full flex justify-center py-12"><div class="loader"></div></div>';
  try {
    const data = rooms ?? await getAllRooms();
    allRoomsCache = data;
    renderRooms(data);
  } catch(err) {
    grid.innerHTML = `<div class="col-span-full text-red-500 text-center py-8">Error: ${err.message}</div>`;
  }
}

function renderRooms(rooms) {
  const q        = searchInput?.value.trim().toLowerCase() ?? '';
  const building = filterBuilding?.value ?? 'all';
  const status   = filterStatus?.value   ?? 'all';

  let filtered = rooms;
  if (q)                  filtered = filtered.filter(r => r.room_number.toLowerCase().includes(q));
  if (building !== 'all') filtered = filtered.filter(r => r.building === building);
  if (status   !== 'all') filtered = filtered.filter(r => r.status   === status);
  if (activeFloor !== 'all') filtered = filtered.filter(r => floorLabel(r.room_number) === activeFloor);

  if (roomCount) roomCount.textContent = `(${filtered.length} rooms)`;

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-16 text-slate-400">
        <span class="material-symbols-outlined text-5xl block mb-3">search_off</span>
        <p class="text-lg font-medium">No classrooms found</p>
      </div>`;
    return;
  }
  grid.innerHTML = filtered.map(buildRoomCard).join('');
  attachCardListeners();
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).substring(0,5).split(':').map(Number);
  return `${h > 12 ? h-12 : h === 0 ? 12 : h}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM':'AM'}`;
}

function buildRoomCard(room) {
  const isVacant   = room.status === 'vacant';
  const isOccupied = !isVacant;
  const bar   = isVacant ? 'bg-green-500' : 'bg-red-500';
  const badge = isVacant
    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  const label = isVacant ? 'Vacant' : 'Occupied';
  const floor = floorLabel(room.room_number);

  const body = isOccupied && room.current_subject
    ? `<div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl mb-6">
         <p class="text-xs text-slate-500 uppercase font-bold mb-1">Ongoing</p>
         <p class="font-bold text-primary text-sm">${room.current_subject}</p>
         ${room.session_start ? `<p class="text-xs text-slate-400 mt-0.5">${fmtTime(room.session_start)} – ${fmtTime(room.session_end)}</p>` : ''}
       </div>`
    : `<div class="space-y-2 mb-6">
         <div class="flex items-center gap-2 text-sm text-slate-400">
           <span class="material-symbols-outlined text-base">location_on</span>
           <span>${room.building}</span>
         </div>
         <div class="flex items-center gap-2 text-sm text-slate-400">
           <span class="material-symbols-outlined text-base">floor</span>
           <span>${floor}</span>
         </div>
       </div>`;

  return `
    <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden hover:shadow-xl transition-shadow room-card cursor-pointer" data-id="${room.id}">
      <div class="h-2 ${bar}"></div>
      <div class="p-6">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h4 class="text-2xl font-bold">${room.room_number}</h4>
            <p class="text-sm text-slate-500 dark:text-slate-400">${room.building} • ${floor}</p>
          </div>
          <span class="${badge} text-xs font-bold px-2 py-1 rounded-lg uppercase">${label}</span>
        </div>
        ${body}
        <div class="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button class="text-primary text-sm font-semibold hover:underline view-schedule-btn" data-id="${room.id}">
            View Schedule →
          </button>
        </div>
      </div>
    </div>`;
}

function attachCardListeners() {
  document.querySelectorAll('.view-schedule-btn, .room-card').forEach(el => {
    el.addEventListener('click', e => {
      const id = el.dataset.id;
      if (id) window.location.href = `/pages/room-detail.html?id=${id}`;
    });
  });
}

function listenRealtime() {
  subscribeToRoomChanges(async () => {
    const fresh = await getAllRooms();
    allRoomsCache = fresh;
    renderRooms(fresh);
    loadStats();
  });

  // Polling every 10 seconds — guarantees frontend always matches backend
  setInterval(async () => {
    try {
      const fresh = await getAllRooms();
      allRoomsCache = fresh;
      renderRooms(fresh);
      loadStats();
    } catch(e) { console.error('[Poll] Error:', e); }
  }, 10000);
}

function bindEvents() {
  searchBtn?.addEventListener('click',   () => renderRooms(allRoomsCache));
  searchInput?.addEventListener('keydown', e => e.key === 'Enter' && renderRooms(allRoomsCache));
  filterBuilding?.addEventListener('change', () => renderRooms(allRoomsCache));
  filterStatus?.addEventListener('change',   () => renderRooms(allRoomsCache));

  // Floor tab clicks
  document.querySelectorAll('.floor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeFloor = tab.dataset.floor;
      document.querySelectorAll('.floor-tab').forEach(t => {
        t.classList.remove('bg-primary', 'text-white');
        t.classList.add('bg-slate-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
      });
      tab.classList.add('bg-primary', 'text-white');
      tab.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
      renderRooms(allRoomsCache);
    });
  });
}

init();
