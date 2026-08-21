// Navbar + tab navigasi. Struktur: tab lama (Home/Stock In/Stock Out/Opname)
// jadi SUB-TAB di bawah satu tab "STOCK", sejajar dengan tab PARTNER dan LOGO
// (dua menu ini diambil dari sj-apk).

import { Router } from './router.js';
import { logOut, formatDateShort, formatTimeShort } from './config.js';

const STOCK_SUBTABS = [
  { path: '/home', label: 'Home' },
  { path: '/stock-in', label: 'Stock In' },
  { path: '/stock-out', label: 'Stock Out' },
  { path: '/opname', label: 'Opname' },
];
const STOCK_PATHS = STOCK_SUBTABS.map((t) => t.path);

const PRIMARY_TABS = [
  { key: 'stock', label: 'STOCK', group: STOCK_PATHS, defaultPath: '/home' },
  { key: 'partner', label: 'PARTNER', path: '/partner' },
  { key: 'logo', label: 'LOGO', path: '/logo' },
];

export function renderShell() {
  const navbar = document.getElementById('app-navbar');
  const tabs = document.getElementById('app-tabs');

  navbar.innerHTML = `
    <div class="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-[#15803D] to-[#16A34A] text-white">
      <div class="flex items-center gap-2 min-w-0">
        <div id="box_internet" title="Status koneksi" class="w-3 h-3 rounded-full border border-white/40 bg-gray-400 flex-shrink-0"></div>
        <span id="karyawan_nama_header" class="font-semibold text-sm truncate"></span>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex flex-col items-end leading-tight">
          <span id="clock_date" class="text-[10px] opacity-80"></span>
          <span id="clock_time" class="text-xs font-semibold opacity-95"></span>
        </div>
        <button id="btn-logout" title="Keluar" class="text-white/90 hover:text-white flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </div>
    </div>
  `;

  tabs.innerHTML = `
    <div>
      <div class="flex gap-1 px-1.5 py-1 bg-white border-b border-ink-faint" id="nav-tabs-primary">
        ${PRIMARY_TABS.map((t) => `
          <a href="${t.path || t.defaultPath}" data-key="${t.key}"
             class="hnt-tab-primary flex-1 text-center text-xs font-bold py-2 rounded-md text-ink-secondary">
            ${t.label}
          </a>
        `).join('')}
      </div>
      <div id="nav-tabs-secondary" class="hidden flex gap-1 px-1.5 py-1 bg-surface-raised border-b border-ink-faint">
        ${STOCK_SUBTABS.map((t) => `
          <a href="${t.path}" data-path="${t.path}"
             class="hnt-tab-secondary flex-1 text-center text-[11px] font-bold py-1.5 rounded text-ink-secondary">
            ${t.label}
          </a>
        `).join('')}
      </div>
    </div>
  `;

  tabs.querySelectorAll('.hnt-tab-primary').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = PRIMARY_TABS.find((t) => t.key === a.dataset.key);
      // Klik STOCK saat belum di grup Stock → masuk ke sub-halaman default (Home).
      // Klik STOCK saat sudah di dalam grup → tetap di halaman saat ini, cuma
      // buka/tutup baris sub-tab (memudahkan re-lihat pilihan tanpa pindah halaman).
      if (tab.group) {
        if (!tab.group.includes(Router.currentRoute.url)) {
          Router.navigate(tab.defaultPath);
        } else {
          document.getElementById('nav-tabs-secondary').classList.toggle('hidden');
        }
      } else {
        Router.navigate(tab.path);
      }
    });
  });

  tabs.querySelectorAll('.hnt-tab-secondary').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      Router.navigate(a.dataset.path);
    });
  });

  document.getElementById('btn-logout').addEventListener('click', () => logOut());

  startClock();
}

export function showAuthedShell(activePath) {
  document.getElementById('app-navbar').classList.remove('hidden');
  document.getElementById('app-tabs').classList.remove('hidden');
  document.getElementById('karyawan_nama_header').textContent = localStorage.getItem('karyawan_nama') || '';

  const inStockGroup = STOCK_PATHS.includes(activePath);

  // Menu aktif = hijau (bg-primary, brand-600 -- sama dgn navbar & ekspedisi-apk),
  // baik di baris tab utama maupun sub-tab. Dulu bg-info/biru, disamakan 2026-08-21.
  document.querySelectorAll('.hnt-tab-primary').forEach((a) => {
    const tab = PRIMARY_TABS.find((t) => t.key === a.dataset.key);
    const active = tab.group ? inStockGroup : tab.path === activePath;
    a.classList.toggle('bg-primary', active);
    a.classList.toggle('text-white', active);
    a.classList.toggle('text-ink-secondary', !active);
  });

  const secondaryRow = document.getElementById('nav-tabs-secondary');
  secondaryRow.classList.toggle('hidden', !inStockGroup);

  document.querySelectorAll('.hnt-tab-secondary').forEach((a) => {
    const active = a.dataset.path === activePath;
    a.classList.toggle('bg-primary', active);
    a.classList.toggle('text-white', active);
    a.classList.toggle('text-ink-secondary', !active);
  });
}

export function hideAuthedShell() {
  document.getElementById('app-navbar').classList.add('hidden');
  document.getElementById('app-tabs').classList.add('hidden');
}

let clockTimer = null;
function startClock() {
  if (clockTimer) clearInterval(clockTimer);
  const dateEl = document.getElementById('clock_date');
  const timeEl = document.getElementById('clock_time');
  const tick = () => {
    const now = new Date();
    dateEl.textContent = formatDateShort(now);
    timeEl.textContent = formatTimeShort(now);
  };
  tick();
  clockTimer = setInterval(tick, 1000);
}