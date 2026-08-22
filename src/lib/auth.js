// Status login -- dipindah keluar dari config.js (2026-08-22, config.js
// sekarang murni APP_CONFIG, bentuk file disamakan dgn ekspedisi-apk yang
// juga punya auth.js sendiri terpisah dari config.js).
//
// [BARU 2026-08-22] Token JWT + auto-attach Authorization header -- modul
// Inventory/Partner/Purchasing di backend-migrasi (beda dari
// backend-production yang dulu dipakai app ini, TANPA auth sama sekali di
// endpoint2 itu) digerbangi App\Middleware\AuthMiddleware, WAJIB header
// `Authorization: Bearer <token>` di semua endpoint selain /inventory/login &
// /inventory/config/check-version. Tanpa ini, login akan "berhasil" (redirect
// ke /home) tapi SEMUA panggilan data berikutnya (material/opname/home/
// stock-in/stock-out/partner/logo) langsung 401.

const TOKEN_KEY = 'token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || null;
}

export function checkLogin() {
  if (localStorage.getItem('login') !== 'true') {
    return false;
  }
  if (!getToken()) {
    return false;
  }
  return true;
}

export function logOut() {
  localStorage.clear();
  // window.location.hash (bukan window.location.href = '/login') -- app ini jalan
  // di Cordova WebView (file://), href absolut ke path polos akan gagal (mencoba
  // load file:///login yg tidak ada). Hash tetap memicu router lewat hashchange
  // (lihat router.js) tanpa reload dokumen.
  window.location.hash = '/login';
  window.location.reload();
}

// Prefix modul backend-migrasi yang butuh JWT Bearer -- SEMUA endpoint
// inventory-apk sekarang ke backend-migrasi (2026-08-22, susulan: Partner &
// Logo tadinya "tetap ke backend-production" krn belum diporting, sekarang
// sudah -- lihat backend-migrasi/src/{Partner,Purchasing}/routes.php).
// Dipertahankan sbg whitelist eksplisit per-prefix (bukan "semua ajax call
// tanpa syarat") supaya kalau suatu saat ada panggilan ke host/API lain lagi,
// endpoint itu TIDAK ikut kebawa header Authorization yang tidak diharapkan.
//
// TANPA garis miring di akhir tiap prefix (beda dari versi sebelumnya yang
// '/partner/') -- [BUG DITEMUKAN 2026-08-22, susulan #3] partner.js panggil
// endpoint list-nya BARE '/partner' (tanpa trailing slash sama sekali, lihat
// fetchPartnerData()), jadi substring '/partner/' TIDAK PERNAH cocok utk
// panggilan itu spesifik -- header Authorization tidak pernah ke-attach,
// backend benar menolak 401. Endpoint '/partner/material' dkk lainnya
// kebetulan tidak kena krn memang sudah py segmen setelahnya. Match sekarang
// dicek per BATAS path (akhir string, '/', atau '?' setelah prefix) supaya
// '/partner' sendirian match tapi hipotetis '/partnerXYZ' tidak.
const AUTHED_PATH_PREFIXES = ['/inventory', '/partner', '/purchasing'];

function isAuthedPath(url) {
  if (!url) return false;
  return AUTHED_PATH_PREFIXES.some((p) => {
    const idx = url.indexOf(p);
    if (idx === -1) return false;
    const after = url.charAt(idx + p.length);
    return after === '' || after === '/' || after === '?';
  });
}

/**
 * Pasang sekali di main.js (sebelum route manapun mount). Dua hal:
 *
 * 1. `ajaxPrefilter` di-scope ke AUTHED_PATH_PREFIXES -- BUKAN semua ajax
 *    call global -- jaga-jaga kalau nanti ada lagi panggilan ke API lain di
 *    luar backend-migrasi. Token kosong (belum login, atau sedang di
 *    endpoint .../login itu sendiri) -> header dilewati begitu saja, tidak
 *    dipaksakan string 'Bearer null'.
 * 2. 401 GLOBAL (token invalid/expired/dicabut) -> paksa logout + balik ke
 *    login, sama pola dgn ekspedisi-apk/src/js/api.js. Guard `getToken()`
 *    (bukan cuma cek xhr.status===401 mentah) supaya 401 dari percobaan
 *    LOGIN itu sendiri (password salah, belum pernah punya token sama
 *    sekali) tidak ikut memicu logOut()+reload yang malah nutup alert
 *    "Password salah" sebelum sempat kebaca user.
 */
export function initAuthInterceptor() {
  jQuery.ajaxPrefilter(function (options) {
    if (isAuthedPath(options.url)) {
      const token = getToken();
      if (token) {
        options.headers = options.headers || {};
        options.headers.Authorization = 'Bearer ' + token;
      }
    }
  });

  jQuery(document).ajaxError(function (event, xhr, settings) {
    if (xhr.status === 401 && isAuthedPath(settings.url) && getToken()) {
      logOut();
    }
  });
}
