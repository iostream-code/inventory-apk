// Navbar + tab navigasi. Struktur: tab lama (Home/Stock In/Stock Out/Opname)
// jadi SUB-TAB di bawah satu tab "STOCK", sejajar dengan tab PARTNER dan LOGO
// (dua menu ini diambil dari sj-apk).

import { Router } from './router.js';
import { logOut } from './auth.js';

// Format jam topbar SENGAJA beda dari formatDateShort/formatTimeShort global
// (config.js, dipakai di tabel/riwayat di seluruh app) -- disalin apa adanya
// dari ekspedisi-apk/src/js/components/navbar.js ("21 Agu 26", spasi bukan
// strip) supaya ISIAN topbar sama persis dgn ekspedisi-apk, TANPA ikut
// mengubah format tanggal global yang dipakai di tempat lain.
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function formatClockDate(d) {
  const year = String(d.getFullYear()).slice(-2);
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${year}`;
}
function formatClockTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const STOCK_SUBTABS = [
  { path: '/home', label: 'Data' },
  { path: '/stock-in', label: 'Stock In' },
  { path: '/stock-out', label: 'Stock Out' },
  { path: '/opname', label: 'Opname' },
];
// Path yang dianggap "masih di dalam grup Stock" utk keperluan highlight tab
// (dipisah dari STOCK_SUBTABS di atas, yang cuma daftar tombol sub-tab yang
// KELIHATAN) -- /material sengaja diikutkan walau tidak py tombol sub-tab
// sendiri (diakses dari ikon "Master" di halaman Data), supaya tab STOCK +
// baris sub-tabnya tetap aktif/kelihatan selagi user ada di halaman itu.
const STOCK_PATHS = [...STOCK_SUBTABS.map((t) => t.path), '/material'];

const PRIMARY_TABS = [
  { key: 'stock', label: 'STOCK', group: STOCK_PATHS, defaultPath: '/home' },
  { key: 'po', label: 'PO', path: '/po' },
  { key: 'partner', label: 'PARTNER', path: '/partner' },
  { key: 'logo', label: 'LOGO', path: '/logo' },
];

export function renderShell() {
  const navbar = document.getElementById('app-navbar');
  const tabs = document.getElementById('app-tabs');

  // Isian topbar disamakan dgn ekspedisi-apk (2026-08-22, lihat
  // src/js/components/navbar.js sana): connection-indicator versi
  // dashed-ring+glow (bukan titik polos), judul app + nama pegawai
  // ditumpuk, jam pakai tabular-nums, tombol logout jadi icon-button
  // sungguhan (bukan ikon polos). Ukuran (px-3 py-2, BUKAN py-2.5 ekspedisi)
  // SENGAJA dipertahankan punya inventory-apk sendiri -- ekspedisi-apk yang
  // ikut disamakan ke ukuran ini, bukan sebaliknya.
  navbar.innerHTML = `
    <div class="flex items-center justify-between bg-gradient-to-r from-[#15803D] to-[#16A34A] px-3 py-2 shadow-card text-white">
      <div class="flex min-w-0 items-center gap-2">
        <div id="box_internet" class="connection-indicator" title="Status koneksi"></div>
        <div class="min-w-0">
          <p class="truncate font-heading text-lg font-semibold leading-none text-white">Inventory</p>
          <p id="karyawan_nama_header" class="mt-0.5 truncate text-xs text-white/70"></p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <div class="text-right leading-tight text-white/80">
          <p id="clock_date" class="text-[11px] font-medium"></p>
          <p id="clock_time" class="text-xs font-semibold tabular-nums"></p>
        </div>
        <button id="btn-logout" title="Keluar" aria-label="Keluar"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white active:scale-95">
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
             class="hnt-tab-primary flex-1 text-center text-xs font-bold py-2 rounded-md bg-slate-100 text-slate-700">
            ${t.label}
          </a>
        `).join('')}
      </div>
      <div id="nav-tabs-secondary" class="hidden flex gap-1 px-1.5 py-1 bg-surface-raised border-b border-ink-faint">
        ${STOCK_SUBTABS.map((t) => `
          <a href="${t.path}" data-path="${t.path}"
             class="hnt-tab-secondary flex-1 text-center text-[11px] font-bold py-1.5 rounded text-slate-700">
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
  // Menu TIDAK aktif = bg-slate-100 + text-slate-700 (2026-08-22, sebelumnya
  // cuma text-ink-secondary/slate-600 tanpa background sama sekali -- pola
  // pill abu-abu ini disamakan dgn tab tidak aktif di ekspedisi-apk/
  // adminTabs.js). Literal slate-700, BUKAN token ink.secondary (dipakai
  // luas di banyak tempat lain sbg warna teks sekunder umum) supaya
  // penggelapan ini spesifik ke menu saja, tidak ikut menggelapkan teks lain.
  document.querySelectorAll('.hnt-tab-primary').forEach((a) => {
    const tab = PRIMARY_TABS.find((t) => t.key === a.dataset.key);
    const active = tab.group ? inStockGroup : tab.path === activePath;
    a.classList.toggle('bg-primary', active);
    a.classList.toggle('text-white', active);
    a.classList.toggle('bg-slate-100', !active);
    a.classList.toggle('text-slate-700', !active);
  });

  const secondaryRow = document.getElementById('nav-tabs-secondary');
  secondaryRow.classList.toggle('hidden', !inStockGroup);

  document.querySelectorAll('.hnt-tab-secondary').forEach((a) => {
    const active = a.dataset.path === activePath;
    a.classList.toggle('bg-primary', active);
    a.classList.toggle('text-white', active);
    a.classList.toggle('text-slate-700', !active);
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
    dateEl.textContent = formatClockDate(now);
    timeEl.textContent = formatClockTime(now);
  };
  tick();
  clockTimer = setInterval(tick, 1000);
}