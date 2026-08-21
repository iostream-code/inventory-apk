// Router ringan pengganti Framework7 router.
// Sengaja meniru sebagian kecil API-nya (`navigate`, `currentRoute.url`)
// supaya kode lama yang dulu memanggil `app.views.main.router.navigate(...)`
// bisa dipindah ke `Router.navigate(...)` dengan perubahan minimal saat
// halaman lain (stock-in/out, opname, material) dimigrasikan menyusul.
//
// Hash-based (window.location.hash), BUKAN history.pushState dgn path polos
// (beda dari versi inventory-app/PWA aslinya) -- app ini jalan di dalam
// Cordova WebView (file://), dan pushState({path},'','/home') akan
// mengubah URL yg terlihat jadi file:///home, yg gagal di-reload/back-
// gesture (layar putih). Sama seperti pola ekspedisi-apk/src/js/router.js.

const pageContainer = document.getElementById('app-page');

const routes = {}; // path -> { mount(container), unmount?(container) }
let current = { path: null, unmount: null };

function readHashPath() {
  return window.location.hash.replace(/^#/, '') || null;
}

export const Router = {
  currentRoute: { url: '/' },

  register(path, handlers) {
    routes[path] = handlers;
  },

  async navigate(path, opts = {}) {
    const route = routes[path];
    if (!route) {
      console.error('[Router] Tidak ada route terdaftar untuk', path);
      return;
    }

    // reloadCurrent: sama seperti F7, izinkan render ulang halaman yang sama
    if (current.path === path && !opts.reloadCurrent) {
      return;
    }

    if (current.unmount) {
      try { current.unmount(pageContainer); } catch (e) { console.error(e); }
    }

    pageContainer.innerHTML = '';
    this.currentRoute.url = path;
    if (readHashPath() !== path) {
      window.location.hash = path;
    }

    const unmount = await route.mount(pageContainer);
    current = { path, unmount: typeof unmount === 'function' ? unmount : null };
  },
};

// TANPA reloadCurrent di sini SENGAJA: navigate() sendiri menulis
// window.location.hash, yg balik memicu event ini secara async untuk path
// yg SAMA -- guard `current.path === path` di atas (reloadCurrent default
// false) meredam echo itu jadi no-op, bukan mount dobel. Perubahan hash dari
// LUAR (back/forward gesture, ganti hash manual) ke path yg BEDA tetap
// jalan normal karena guard hanya aktif kalau path-nya sama persis.
window.addEventListener('hashchange', () => {
  const path = readHashPath();
  if (path) Router.navigate(path);
});

export function startRouter(defaultPath) {
  const path = readHashPath();
  Router.navigate(path && path in routes ? path : defaultPath, { reloadCurrent: true });
}
