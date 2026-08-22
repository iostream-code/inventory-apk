# Roadmap: migrasi backend Inventory ke `backend-migrasi`

Dokumen pelacak kerja migrasi bertahap modul Inventory dari `backend-production` (Laravel 5.6
lama) ke [`backend-migrasi`](../backend-migrasi) (Slim 4, PDO polos) — mengikuti pola yang sudah
terbukti jalan di modul Ekspedisi (`ekspedisi-apk` + `backend-migrasi/src/Ekspedisi/`). Update
dokumen ini tiap ada progres — jangan simpan status hanya di memori percakapan.

**Status saat ini (2026-08-22, susulan #2): cutover LOCAL sudah SELESAI, semua modul.** Catatan
sebelumnya di sini bilang "Endpoint Partner/Logo TIDAK ikut, tetap ke backend-production" — itu
sudah BASI: `partner.js`/`logo.js` sekarang JUGA ke `backend-migrasi` (modul baru `src/Partner/`
& `src/Purchasing/`, lihat "Selesai" di bawah). `src/lib/config.js` `APP_CONFIG.API_BASE_URL`
LOCAL diarahkan ke `backend-migrasi` (Slim, satu proses jalan bareng Ekspedisi/Inventory/Partner/
Purchasing), dan **SELURUH** endpoint app ini (login/material/opname/home-dashboard/stock-in/
stock-out/partner/logo) sekarang HARUS ke `backend-migrasi` supaya jalan (butuh JWT Bearer,
backend-production tidak). **Production build** (baris `API_BASE_URL` yang di-comment di
`config.js`) **BELUM disesuaikan** ke kontrak `backend-migrasi` — masih nunjuk
`backend-production`, jangan diaktifkan begitu saja tanpa update kontrak login-nya juga (lihat
entri "Bug login tertukar dgn Ekspedisi" di bawah).

---

## 🟡 Sedang dikerjakan / dijadwalkan

(kosong saat ini — semua endpoint yang dipanggil FE sudah diporting & terhubung ke
`backend-migrasi`; keputusan cutover frontend sudah diambil: big-bang, semua modul sekaligus,
lihat "Status saat ini" di atas)

## 📦 Backlog (belum dijadwalkan, di luar fokus migrasi saat ini)

Fitur-fitur ini juga belum ada di `inventory-apk` **sendiri** (lihat "Status fitur" di
`README.md`) — porting backend-nya baru relevan setelah fitur frontend-nya ada:
- Retur & replacement (Stock In/Out), Manual Stock In/Out, Purchase Request list.
- Excel import/template Material, export Excel/PDF (Material/Stock In/Opname) — sengaja
  dilewati saat porting Material & Opname (lihat "Selesai" di bawah), bukan lupa.

---

## ✅ Selesai

- [x] **Bug: `/partner` (list, bare tanpa trailing slash) tidak kebawa header Authorization**
  (2026-08-22, susulan #3) — `AUTHED_PATH_PREFIXES` di `auth.js` sebelumnya berisi `'/partner/'`
  (WITH trailing slash), tapi `partner.js::fetchPartnerData()` manggil endpoint list-nya BARE
  `/partner` (tanpa trailing slash sama sekali) -- substring match `'/partner/'` tidak pernah
  cocok utk URL itu spesifik, jadi `initAuthInterceptor`'s `ajaxPrefilter` tidak pernah nempelin
  token ke request itu, backend (benar) tolak 401. Endpoint Partner lainnya
  (`/partner/material`, dst) kebetulan tidak kena krn memang sudah py segmen path setelahnya.
  **Fix**: prefix di whitelist dihapus trailing slash-nya (`'/partner'` polos), match sekarang
  cek batas path (akhir string / `/` / `?` setelah prefix) via `isAuthedPath()`, bukan substring
  polos -- supaya `/partner` sendirian ikut match tapi hipotetis `/partnerXYZ` tidak. Diverifikasi
  dgn simulasi Node (semua URL nyata dari app ini dicek match/tidak-nya sesuai harapan) + re-cek
  live `GET /partner` dgn token ke `backend-migrasi` (200, bukan 401 lagi).
- [x] **Modul Partner (`src/Partner/`) & Purchasing/Logo (`src/Purchasing/`) diporting**
  (2026-08-22, susulan #2) — dua modul BARU di `backend-migrasi`, di luar Ekspedisi/Inventory,
  port dari `backend-production` `API\Partner\{PartnerController,MaterialController,
  DeliveryController,ReturController}` (endpoint yang dipakai `partner.js` saja — bukan
  `get-partner-data`/`approve`/`add-payment`/`transaksi/{id}/status`/`delete`/`get-partner-summary`,
  itu dipakai app lain/tidak dipanggil `inventory-apk`) + `API\PurchasingController` (SEMUA method-nya
  — cuma 3, dipakai `logo.js`).
  - **Prefix modul**: Partner `/partner` (SAMA dgn backend-production, sengaja — cuma host-nya
    yang pindah), Purchasing `/purchasing` (BARU, backend-production-nya top-level tanpa prefix
    sama sekali).
  - **[Keputusan sadar user, beda dari default replikasi 1:1]** Backend-production TIDAK punya
    auth sama sekali di endpoint2 ini (siapa saja yang tahu URL bisa baca/tulis). Di sini
    **digerbangi JWT** (`AuthMiddleware`), konsisten dgn Ekspedisi/Inventory. Konsekuensi: FE ikut
    berubah — `src/lib/auth.js::initAuthInterceptor` scope-nya diperluas dari cuma `/inventory/`
    jadi whitelist `['/inventory/', '/partner/', '/purchasing/']`; `logo.js` dapat prefix
    `/purchasing` (dulu bare `/get-data-purchase` dst); `partner.js` TIDAK perlu diubah sama
    sekali (path-nya sudah `/partner/...` dari awal, persis sama dgn backend-production).
  - **Response envelope SENGAJA beda-beda per controller** (dikutip apa adanya, BUKAN salah
    porting): Partner/Material/Delivery pakai `{success: bool, ...}`, Retur pakai
    `{status: bool, ...}` (key BEDA!), Purchasing getDataPurchase pakai `{status: int 200/404/500,
    ...}` (HTTP response-nya sendiri selalu 200), 2 endpoint upload foto Purchasing pakai
    `{status: 'done'|'failed'}` (string). Inkonsistensi ini asli dari backend-production.
  - **Kolom `getDataPurchase` dipangkas** ke yang benar-benar dibaca `logo.js` (10 kolom) — versi
    asli implicit `SELECT *` gabungan 3 tabel (80+ kolom, `t_penjualan_header`+
    `t_penjualan_detail_performa`+`m_client`) krn tidak ada `->select()` eksplisit sama sekali,
    bukan kontrak yang disengaja.
  - **Observasi (belum diperbaiki, di luar scope port backend)**: `logo.js` pakai
    `foto_purchase_logo_selesai`/`foto_resin_selesai` (bare filename dari DB, mis.
    `foto_purchasing_logo1735000000.jpg`) LANGSUNG sbg `<img src>` tanpa prefix host apa pun —
    baik di backend-production maupun di sini (diporting apa adanya). Kemungkinan sudah lama
    rusak di app asli juga (bukan regresi porting ini) — foto lama tidak akan tampil di popup
    preview kalau app jalan sbg Cordova `file://` (perlu URL absolut). Foto BARU (baru diupload)
    tetap tersimpan benar di server terlepas dari ini.
  - Diverifikasi live end-to-end thd database produksi: SEMUA endpoint read (list transaksi,
    material, delivery, retur-by-pengiriman, get-data-purchase) dicek balikin data asli persis
    sama field-nya. SEMUA endpoint write diuji pakai 1 baris `partner_transaksi` test (FK
    `id_partner`/`penjualan_detail_performa_id` pinjam dari data asli yg sudah ada, read-only,
    tidak diubah) — add material (dgn & tanpa foto), add delivery (update agregat
    `partner_transaksi.jumlah_diterima` dicek benar), input retur (over-retur DITOLAK, pesan sisa
    dicek benar), input penerimaan retur partial→SELESAI (dicek `jumlah_diterima`/`jumlah_retur`
    balik ke nilai semula sesuai algoritma asli), 2 endpoint upload foto Purchasing (dicek file
    fisik + kolom DB, lalu keduanya dikembalikan ke `NULL` semula). Semua baris test
    (`partner_transaksi`+`_detail`, `partner_detail_pengiriman`, `partner_detail_retur`) &
    file upload test di-hard-delete setelahnya.
- [x] **Bug login tertukar dgn Ekspedisi + FE disesuaikan ke kontrak `backend-migrasi`**
  (2026-08-22, susulan) — dua bug ditemukan sekaligus saat menguji login gudang setelah
  `API_BASE_URL` LOCAL diarahkan ke `backend-migrasi`:
  1. `login.js` memanggil `/login` polos (`APP_CONFIG.LOGIN_ENDPOINT`) TANPA prefix — di
     `backend-migrasi` waktu itu jatuh ke `AuthController` milik modul **Ekspedisi** (flat tanpa
     prefix, Slim mencocokkan ke situ duluan), BUKAN Inventory. Login pakai akun gudang tetap
     "berhasil" tersambung ke server tapi balikin bentuk response Ekspedisi (`role: driver/admin`,
     tanpa jabatan/divisi/pabrik) — kredensial benar tapi diam-diam gagal redirect ke `/home`.
  2. `login.js` juga masih parsing bentuk response `backend-production` lama (`{success, data:
     {jabatan, divisi, ...}}` + `resolveGudangRole()` di FE) — TIDAK cocok dgn `backend-migrasi`
     Inventory `AuthController::login` yang balikin `{token, role, user:{...}}` langsung & sinyal
     gagal lewat HTTP status code, bukan `{success:false}`.
  - **Fix backend**: modul Ekspedisi di `backend-migrasi` SEKARANG diprefix `/ekspedisi`
    (dari sebelumnya flat) — sama pola dgn Inventory yang dari awal MEMANG `/inventory/*` —
    supaya dua modul TIDAK PERNAH bisa bentrok path lagi apa pun urutan mount-nya. Detail &
    catatan koordinasi deploy ada di `backend-migrasi/src/Ekspedisi/routes.php` &
    `backend-migrasi/README.md`. `ekspedisi-apk` (`src/js/{api,auth,versionCheck}.js`) ikut
    disesuaikan di sesi yang sama.
  - **Fix FE (`inventory-apk`)**: `login.js` sekarang panggil `/inventory` + `LOGIN_ENDPOINT`
    (nilai `'/login'` TETAP, prefix ditambah di pemanggil — bukan diganti `/login-new` seperti
    percobaan fix sebelumnya di sesi ini yang SALAH arah, backend target memang `backend-migrasi`
    bukan `backend-production`), parsing response `{token,role,user}` langsung, `resolveGudangRole()`
    FE dihapus (role SELALU dari server). `auth.js` dapat `getToken()`/`initAuthInterceptor()` —
    `$.ajaxPrefilter` yang SCOPED ke path mengandung `/inventory/` (supaya panggilan Partner/Logo
    ke `backend-production` tidak ikut kebawa header `Authorization`) auto-attach
    `Authorization: Bearer <token>`, + auto-logout global saat 401 (guard `getToken()` supaya 401
    dari percobaan login sendiri, password salah, tidak ikut trigger). Dipasang sekali di
    `main.js` sebelum route manapun mount.
  - **Bug tambahan ditemukan & diperbaiki (kelas sama)**: `version-check.js` juga memanggil
    `/config/check-version` TANPA prefix `/inventory` — selalu 404 di `backend-migrasi` (beda
    dari `backend-production` yang memang punya Config module top-level tanpa prefix apa pun).
  - Diverifikasi live via curl terhadap `backend-migrasi` dev server: path lama tanpa prefix
    (`/login`, `/config/check-version`, `/admin/sj` milik Ekspedisi) sekarang 405 (tidak ada
    controller nyambung lagi, cuma ketangkep catch-all OPTIONS handler di `bootstrap.php`),
    `/ekspedisi/login` & `/inventory/login` masing-masing balikin controller modulnya sendiri
    dgn benar, `/ekspedisi/config/check-version` & `/inventory/config/check-version` masing-masing
    balikin `config_id` modulnya sendiri (`VERSION_EKSPEDISI_PUSAT` vs `VERSION_INVENTORY_PUSAT`),
    `/ekspedisi/admin/sj` tanpa token tetap 401 (nesting `AuthMiddleware`/`AdminOnlyMiddleware`
    utuh, tidak ikut rusak oleh restrukturisasi prefix). Tidak ada login sungguhan yang dicoba
    (perlu password akun asli, tidak dicoba tebak) — verifikasi via kombinasi kredensial salah
    (cek shape error) + baca kode kedua sisi (FE & BE) baris per baris.
- [x] **Endpoint Home Dashboard, Stock In, Stock Out** (2026-08-22, subset yang dipakai FE) —
  port dari `backend-production` `API\Inventory\{HomeController,StockInController,
  StockOutController}` + `DashboardService`/`MaterialService::getMaterialDetail`/`ReceiveService`/
  `MaterialIssueService` (Eloquent) ke `backend-migrasi` (Slim/PDO). Hanya endpoint yang
  benar-benar dipanggil app ini saat ini (dicek via grep `src/pages/{home,stock-in,stock-out}`):
  `home-dashboard/{get-dashboard,get-material-detail}`,
  `stock-in/{get-stockin-active,get-stockin-po-items,get-stockin-po-detail,submit-stockin-receive}`,
  `stock-out/{get-stockout-active,get-stockout-req-items,get-stockout-req-detail,submit-stockout}`
  — endpoint lain di controller aslinya (Stock In/Out Done, History, Manual, retur/replacement,
  export Excel/PDF, popup Request PO di Home) TIDAK diporting, sama pola dgn Material/Opname
  sebelumnya (fitur yg belum ada UI-nya di FE, bukan lupa).
  - **[DISEDERHANAKAN dari versi asli, keputusan sadar]** `submitStockInReceive` versi asli
    (`ReceiveService`) auto-alokasi tiap item ke SJ (Surat Jalan) digital OPEN (FIFO lintas SJ)
    atau auto-create "shadow SJ" ke `pur_t_surat_jalan(_detail)` kalau tidak ketemu — integrasi
    penuh modul Shipping/SJ purchase. **TIDAK direplikasi** di sini: cuma insert receive
    header+detail, update `qty_received` PO, lalu `StockPosting::postIn()` — `sj_detail_id`
    SELALU NULL. Alasan (dikonfirmasi user sebelum porting): modul SJ digital belum pernah
    dipakai live sama sekali (`pur_t_surat_jalan` 0 baris dicek langsung ke DB produksi saat itu),
    dan `inventory-apk` sendiri TIDAK PERNAH kirim `surat_jalan_id`/`sj_detail_id` di payload-nya.
    Detail lengkap & alasan penuh ada di docblock `StockInController.php`. Kalau modul Shipping/SJ
    mulai dipakai beneran nanti, porting bagian shadow-SJ perlu sesi terpisah (butuh
    `SuratJalan`+`SuratJalanDetail` model/service tambahan, di luar Inventory).
  - **`App\Inventory\Support\StockPosting::postIn()`/`postOut()` diperluas** — ditambah dukungan
    flag opsional `decrement_outstanding_in`/`decrement_outstanding_out` (port dari flag yang sama
    di `StockPostingService` asli, dipakai StockIn/StockOut supaya `qty_outstanding_in`/
    `qty_outstanding_out` di `wh_t_stock_balance` ikut berkurang saat barang benar-benar
    diterima/keluar). Default 0 (tidak dipakai) — Opname/Material tidak terpengaruh sama sekali.
  - **Bug ditemukan & diperbaiki (bukan bawaan port ini, ternyata sudah ada di
    `MaterialController::getMaterials` juga)**: pola `in_array($body['x'] ?? 'all', [...]) ?
    $body['x'] : 'all'` — kalau key `x` TIDAK ADA sama sekali di body (persis yang terjadi tiap
    filter status di-set "Semua" di FE, lihat `home.js`/`material.js`: key `status_filter` di
    -omit, bukan dikirim `"all"`), null-coalesce pertama bikin `in_array()` lolos pakai fallback
    `'all'`, TAPI branch `true`-nya balik akses `$body['x']` mentah (undefined → `null`), BUKAN
    fallback-nya — hasil akhirnya `statusFilter` jadi `NULL`, bukan `'all'`, bikin filter di bawah
    salah nolak SEMUA baris. Diperbaiki di 2 tempat (`HomeController::getDashboard` yg baru &
    `MaterialController::getMaterials` yg sudah ada) — simpan hasil null-coalesce ke variabel dulu,
    baru dipakai dobel.
  - **Diverifikasi live end-to-end** terhadap database produksi (bukan cuma `php -l`): PO nyata
    (`PO-00001`, satu-satunya PO di produksi saat itu, status `READY`) di-receive partial (30/90,
    cek status jadi `PARTIAL_RECEIVED`, progress 33%) lalu full (60 sisanya, cek status
    `RECEIVED`, progress 100%, over-receive setelah itu benar DITOLAK) — stok material & WAC di
    `wh_t_stock_balance`/`wh_log_stock_mutation` dicek cocok tiap langkah via
    `home-dashboard/get-material-detail`. Stock Out diuji pakai 1 baris `prd_t_req_material` test
    (tidak ada data asli sama sekali saat itu, 0 baris) — partial issue (4/10, `PARTIAL_ISSUED`),
    over-issue (DITOLAK, sisa 6 diminta 100), lalu selesaikan sisa 6 (`ISSUED`, progress 100%,
    stok turun 40→30 sesuai). Semua data test (PO test kembali ke `READY`/`qty_received=0`, req
    material test, baris `pur_t_receive_warehouse(_detail)`/`prd_t_material_issue(_detail)`, dan
    baris ledger `wh_log_stock_mutation` yang ikut ter-insert) di-hard-delete + balance
    `wh_t_stock_balance` dikembalikan manual ke nilai semula setelahnya — counter
    `cfg_m_doc_number` (`RCV`/`ISS`) SENGAJA tidak di-rollback, pola sama dgn verifikasi
    Material/Opname sebelumnya.
- [x] **`src/lib/config.js` disederhanakan** (2026-08-22) — const terpisah `BASE_API_INVENTORY`
  (base URL kedua khusus modul Inventory) dihapus, disatukan lewat `APP_CONFIG.API_BASE_URL` +
  prefix `/inventory` ditambahkan inline di tiap pemanggil (`opname.js`, `material.js`,
  `home.js`, `stock-in.js`, `stock-out.js`) — pola yang sama dgn `/partner/...` (`partner.js`,
  `logo.js`) yang memang sudah begitu dari awal, jadi tidak perlu base URL kedua hanya untuk 1
  modul. `config.js` sekarang cuma berisi object `APP_CONFIG` (bentuknya disamakan persis dgn
  `ekspedisi-apk/src/js/config.js` — tanpa fungsi apa pun). Helper format (`numberFormat`/
  `formatDateShort`/`formatTimeShort`/`formatTgl`) dipindah ke `src/lib/format.js` baru;
  `checkLogin`/`logOut` dipindah ke `src/lib/auth.js` baru. `npm run build` diverifikasi sukses
  setelah semua 11 file pemanggil disesuaikan, digrep ulang seluruh `src/` untuk memastikan tidak
  ada sisa referensi `BASE_API_INVENTORY`/`BASE_API`/`BASE_GAMBAR`.
- [x] **Menu direstruktur** (2026-08-21) — sub-tab "Home" di bawah STOCK diganti nama jadi
  **"Data"** (`STOCK_SUBTABS` di `shell.js`); tombol menu Master Barang (ikon di halaman Data)
  navigasi ke `/material` tanpa mematikan highlight tab STOCK & baris sub-tabnya (`/material`
  ditambahkan ke `STOCK_PATHS`, terpisah dari daftar tombol sub-tab yang dirender); **PO**
  dipisah jadi tab top-level tersendiri di sebelah STOCK (`src/pages/po/`, sebelumnya ikon
  "Request PO" di halaman Home) — isinya masih placeholder, lihat README "Status fitur". Semua
  tombol menu & tabel (STOCK, Master Stock kolom Opsi) diseragamkan berlatar abu-abu
  (`bg-slate-*`), bukan teks polos tanpa latar. Tombol menu tidak aktif dikasih latar
  `bg-slate-100` (2026-08-22, susulan).
- [x] **`config_id` version-check dikoreksi ke `VERSION_INVENTORY_PUSAT`** (2026-08-22) — catatan
  sebelumnya di dokumen ini ("`VERSION_INVENTORY` belum ada, perlu di-seed") ternyata SALAH cek:
  yang dicek waktu itu string `VERSION_INVENTORY` (tanpa akhiran), padahal baris yang BENAR-BENAR
  ada di produksi (sudah di-seed user sendiri, bukan oleh sesi ini) pakai akhiran `_PUSAT` sama
  seperti app lain (`VERSION_EKSPEDISI_PUSAT`, dst): `VERSION_INVENTORY_PUSAT`, `config_value_minimal
  1.00000` / `config_value_string '1.00'` — persis cocok dgn versi launching 1.0.0 /
  `android-versionCode 1` di `config.xml`. Dikoreksi di 2 tempat: `backend-migrasi`
  (`Inventory/Controllers/ConfigController::CONFIG_ID`) dan `backend-production`
  (`VersionController::$configIdMap['inventory']`, dulu juga salah `'VERSION_INVENTORY'`).
  Diverifikasi live: `POST /inventory/config/check-version` di `backend-migrasi` sekarang
  mengembalikan baris config asli (bukan `null`/fail-open). **Tidak perlu seed manual** —
  infra version-check sudah siap dipakai begitu FE cutover.
- [x] **Scaffold Cordova `inventory-apk`** (2026-08-21) — dibuat dari `inventory-app` (hasil
  migrasi Framework7→Vite sebelumnya, sempat jadi PWA), setup Cordova mengikuti pola
  `ekspedisi-apk` persis (`config.xml` id `com.koperindo.inventory`, `bump-version.cjs`,
  `fix-platform-type.cjs`, `resources/` icon+splash **byte-identik** dgn `ekspedisi-apk`).
  Plugin Cordova ditrim ke yang benar-benar dipakai (whitelist/device/statusbar/splashscreen —
  TIDAK ada camera/geolocation, app ini pakai `<input type=file>` polos utk foto).
  - **Fix kritis**: router `inventory-app` asli pakai `history.pushState`/`location.pathname`
    (aman di browser/PWA, TAPI rusak di Cordova `file://` — reload/back-gesture jadi layar
    putih). Diganti hash-based (`location.hash`), sama pola dgn `ekspedisi-apk/src/js/router.js`.
    `config.js::logOut()` juga diperbaiki (dulu `location.href = '/login'` absolut, sama-sama
    rusak di `file://`).
- [x] **Tema warna & style login diseragamkan dgn `ekspedisi-apk`** (2026-08-21) — token
  `primary`/`ink`/`surface` pindah dari palet ad-hoc (termasuk skala Tailwind `gray`) ke palet
  brand hijau + `slate` netral milik `ekspedisi-apk`. Halaman login: layout kartu-kaca+grid+orb
  `inventory-apk` dipertahankan (disukai user), tapi struktur section (judul app, quotes, footer
  satu baris, toggle password) & warna disamakan dgn `ekspedisi-apk`. Logo login diganti ke
  `logo_koperindo_hitam.png` (flat) — dipakai juga di `ekspedisi-apk` sekarang (sebelumnya app
  itu pakai `logo_koperindo.jpeg` dgn backdrop lingkaran baked-in).
  - Ditemukan & diperbaiki regresi kecil dari retint pertama: kartu status "TIPIS" (low stock)
    di Home sempat ikut jadi hijau (harusnya oranye/`warning`, match `border-orange-200`-nya).
  - `bg-info`/`text-info` (biru) di seluruh app disapu ke `bg-primary` (hijau) KECUALI 3 tempat
    yang terbukti biru-nya bermakna beda (bukan sekadar warna primary yang salah pakai token):
    kartu status "overstock" di Home, tombol 3-state RETUR di Partner (gray/hijau/biru =
    belum/proses/selesai), tombol "Bukti" & ikon Barcode/Refresh yang bersebelahan langsung dgn
    ikon hijau lain (kalau ikut hijau jadi tidak bisa dibedakan).
- [x] **Rename `ekspedisi-apk-backend` → `backend-migrasi` + restrukturisasi modul** (2026-08-21)
  — lihat `backend-migrasi/README.md` bagian "Modul" untuk detail lengkap. Ringkas: kode Ekspedisi
  dipindah ke `src/Ekspedisi/` (namespace berubah, **path route TIDAK berubah** — frontend
  `ekspedisi-apk` yang sudah live tidak terganggu), infra generik (`Database`, `Jwt`,
  `PhotoStorage`, `AuthMiddleware`, base `Controller`) tetap di `src/` root dipakai bersama,
  `src/Inventory/` disiapkan sbg modul baru dgn prefix `/inventory/*` (beda dari Ekspedisi yang
  flat, supaya tidak pernah bentrok path).
- [x] **Auth modul Inventory** (2026-08-21, `backend-migrasi/src/Inventory/Controllers/AuthController.php`)
  — `POST /inventory/login`: validasi `shared_m_users`, gate divisi Gudang (`divisi_id=8` DAN
  `kode='WH'`, dicek berdua), role dari jabatan (`MANAJER`/`SPV`→`AdminGudang`, `STAFF`→
  `StaffGudang`, lainnya ditolak). Diverifikasi live: query JOIN 3 tabel jalan benar terhadap 2
  akun test nyata di produksi (`AdminGudang`/`StaffGudang`, keduanya divisi WH) — satu di
  antaranya kebetulan `user_active=0` di data asli, terbukti benar KETOLAK (bukan bug).
- [x] **Endpoint Material** (2026-08-21, `MaterialController.php`) — list+search+filter status
  (ok/low/empty/overstock), dropdown unit/kategori, create/update (+ upload foto via
  `PhotoStorage`, kode `MAT-{NNNNN}` & barcode auto-generate), soft-delete. Diverifikasi live
  (baca: data asli 234 material; tulis: 1 material test dibuat lalu dihapus permanen).
- [x] **Endpoint Opname — state machine penuh** (2026-08-21, `OpnameController.php`) — sesi
  (list+filter bulan/tahun+scope per role), detail, lookup material (qty_system disembunyikan
  dari StaffGudang), create session, save-scan (snapshot qty_system sekali di scan pertama),
  submit (role-aware: AdminGudang auto-approve, StaffGudang tunggu approval), approve/reject
  (admin-only), delete/cancel. **Termasuk posting stok asli** (bukan cuma ubah status) —
  `App\Inventory\Support\StockPosting` (WAC/avg cost, ledger `wh_log_stock_mutation`,
  `wh_t_stock_adjustment`+detail) & `App\Support\DocumentNumber` (nomor dokumen `cfg_m_doc_number`,
  dipakai bersama modul lain) diport dari `Services/Shared/{StockPostingService,DocumentNumberService}.php`.
  - **Perbaikan keamanan dari kode asli**: versi Laravel mempercayai `user_position` dari BODY
    request untuk keputusan `approve-session`/`reject-session` (comment di source aslinya sendiri
    menandai ini sbg lubang keamanan yang belum diperbaiki). Di sini role SELALU dari JWT
    (`AuthMiddleware`), tidak pernah dari body — diverifikasi live: token `StaffGudang` dapat 403
    murni saat coba `reject-session`.
  - Diverifikasi live end-to-end (bukan cuma `php -l`): material test → sesi opname surplus
    (submit AdminGudang, auto-approve) → cek `wh_t_stock_balance`/`wh_log_stock_mutation`/
    `wh_t_stock_adjustment(_detail)` ter-update benar → sesi kedua shortage (posting OUT juga
    diverifikasi) → sesi ketiga submit sbg StaffGudang (tetap `SUBMITTED`, tidak auto-approve) →
    reject oleh AdminGudang. Semua data test di-hard-delete setelahnya (bukan soft-delete) —
    counter `cfg_m_doc_number` (`MAT`/`OPN`/`ADJ`) SENGAJA tidak di-rollback (celah nomor dari
    data test dibiarkan, lebih aman drpd risiko nomor kepakai ulang).
  - **Bug ditemukan & diperbaiki saat implementasi** (bukan bawaan kode asli): PDO_MySQL dgn
    `ATTR_EMULATE_PREPARES=false` (sudah di-set dari awal di `Database.php`) MENOLAK named
    placeholder yang sama dipakai >1× dalam satu query (`SQLSTATE[HY093]: Invalid parameter
    number`) — beda dari mode emulated. Kena di 8 query (kombinasi kolom `created_at`/
    `updated_at` yang sama-sama `:now`, dst) di `MaterialController`/`OpnameController`/
    `StockPosting`. Semua sudah diperbaiki (placeholder dibedakan `:now1`/`:now2` dst) &
    diverifikasi ulang lewat test live di atas. **Kalau nulis query baru di modul mana pun di
    `backend-migrasi`, jangan pakai nama placeholder yang sama 2× dalam satu query.**
