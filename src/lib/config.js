// Konfigurasi API app ini -- bentuk file disamakan dgn ekspedisi-apk
// (src/js/config.js sana): satu object APP_CONFIG, bukan beberapa const
// terpisah (2026-08-22, sebelumnya BASE_API/BASE_API_INVENTORY/BASE_GAMBAR
// tiga const lepas di file ini). Helper format (numberFormat/formatDateShort/
// dst) & status login (checkLogin/logOut) SUDAH DIPINDAH ke format.js dan
// auth.js masing-masing -- file ini sekarang MURNI konfigurasi, tidak ada
// fungsi apa pun, sama seperti config.js ekspedisi-apk.
//
// BASE_API_INVENTORY (const terpisah utk endpoint modul inventory) SUDAH
// DIHAPUS -- endpoint modul Inventory (login/home-dashboard/material/opname/
// stock-in/stock-out) cukup tambahkan prefix '/inventory' sendiri di tiap
// pemanggil (mis. APP_CONFIG.API_BASE_URL + '/inventory/material/get-materials'),
// tidak perlu base URL kedua yang terpisah hanya utk satu modul. Endpoint
// Partner/Logo (partner.js/logo.js) BEDA lagi -- itu masih ke
// backend-production sepenuhnya (modul terpisah di sana, bukan bagian dari
// migrasi Inventory), TANPA prefix apa pun, lihat ROADMAP.md.
//
// [KOREKSI 2026-08-22] Catatan sebelumnya di sini bilang "app ini MASIH
// memanggil backend-production sepenuhnya" -- itu status ROADMAP.md yang
// SUDAH BASI utk environment LOCAL: API_BASE_URL di bawah sudah diarahkan ke
// backend-migrasi (Slim, satu proses jalan bareng modul Ekspedisi -- yang
// sekarang JUGA diprefix '/ekspedisi', sama pola dgn Inventory, lihat
// backend-migrasi/src/Ekspedisi/routes.php), bukan lagi backend-production.
// Endpoint modul Inventory di atas sekarang HARUS ke backend-migrasi kalau
// API_BASE_URL LOCAL aktif -- backend-migrasi mewajibkan JWT Bearer di semua
// endpoint itu KECUALI login & check-version (lihat auth.js::initAuthInterceptor
// utk auto-attach header-nya). Partner/Logo TIDAK ikut cutover ini -- lihat
// ROADMAP.md utk kapan production build (baris API_BASE_URL yang di-comment
// di bawah) menyusul.
export const APP_CONFIG = {
  // Ganti sesuai environment. Untuk device fisik jangan pakai 'localhost', pakai IP LAN atau domain staging.
  API_BASE_URL: 'http://127.0.0.1:8000', // API LOCAL -- backend-migrasi (Slim)
  // API_BASE_URL: 'https://indokoper.com/api', // API PRODUCTION -- backend-production, BELUM disesuaikan ke kontrak backend-migrasi (lihat catatan di atas)

  IMAGE_BASE_URL: 'https://indokoper.com', // dipakai utk susun URL foto (mis. photo_url material)

  // POST {API_BASE_URL}/inventory{LOGIN_ENDPOINT} -> App\Inventory\Controllers\AuthController::login
  // (backend-migrasi) -- prefix '/inventory' ditambah di login.js (pola sama
  // dgn endpoint modul Inventory lain), BUKAN dibakukan di sini, supaya nilai
  // '/login' ini tetap konsisten sbg "nama endpoint" murni, sama pola dgn
  // ekspedisi-apk/src/js/config.js (yang juga LOGIN_ENDPOINT='/login', prefix
  // '/ekspedisi' modulnya ditambah di ekspedisi-apk/src/js/auth.js).
  LOGIN_ENDPOINT: '/login', // POST { username, password } -> { token, role, user } (lihat login.js)
};
