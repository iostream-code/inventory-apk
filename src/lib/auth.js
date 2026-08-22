// Status login -- dipindah keluar dari config.js (2026-08-22, config.js
// sekarang murni APP_CONFIG, bentuk file disamakan dgn ekspedisi-apk yang
// juga punya auth.js sendiri terpisah dari config.js).
//
// [BARU 2026-08-22] Token JWT + auto-attach Authorization header -- modul
// Inventory di backend-migrasi (beda dari backend-production yang dulu
// dipakai app ini, TANPA auth sama sekali di endpoint /inventory/*) digerbangi
// App\Middleware\AuthMiddleware, WAJIB header `Authorization: Bearer <token>`
// di semua endpoint selain /inventory/login & /inventory/config/check-version.
// Tanpa ini, login akan "berhasil" (redirect ke /home) tapi SEMUA panggilan
// data berikutnya (material/opname/home/stock-in/stock-out) langsung 401.

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

/**
 * Pasang sekali di main.js (sebelum route manapun mount). Dua hal:
 *
 * 1. `ajaxPrefilter` di-scope KHUSUS ke path mengandung '/inventory/' --
 *    BUKAN semua ajax call global -- supaya panggilan Partner/Logo (masih ke
 *    backend-production, lihat home.js/logo.js/partner.js) TIDAK ikut kebawa
 *    header Authorization yang bisa memicu CORS preflight gagal di sana
 *    (server itu tidak mengharapkan/mengizinkan header itu). Token kosong
 *    (belum login, atau sedang di endpoint /inventory/login itu sendiri)
 *    -> header dilewati begitu saja, tidak dipaksakan string 'Bearer null'.
 * 2. 401 GLOBAL (token invalid/expired/dicabut) -> paksa logout + balik ke
 *    login, sama pola dgn ekspedisi-apk/src/js/api.js. Guard `getToken()`
 *    (bukan cuma cek xhr.status===401 mentah) supaya 401 dari percobaan
 *    LOGIN itu sendiri (password salah, belum pernah punya token sama
 *    sekali) tidak ikut memicu logOut()+reload yang malah nutup alert
 *    "Password salah" sebelum sempat kebaca user.
 */
export function initAuthInterceptor() {
  jQuery.ajaxPrefilter(function (options) {
    if (options.url && options.url.indexOf('/inventory/') !== -1) {
      const token = getToken();
      if (token) {
        options.headers = options.headers || {};
        options.headers.Authorization = 'Bearer ' + token;
      }
    }
  });

  jQuery(document).ajaxError(function (event, xhr, settings) {
    if (xhr.status === 401 && settings.url && settings.url.indexOf('/inventory/') !== -1 && getToken()) {
      logOut();
    }
  });
}
