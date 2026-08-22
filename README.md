# inventory-apk

Aplikasi **Inventory** — manajemen stok gudang Koperindo (Material, Opname, Stock In/Out,
PO, Partner, Logo). Cordova (`com.koperindo.inventory`) + jQuery + Tailwind + Vite, dibangun
2026-08-21 dengan setup/tema mengikuti [`ekspedisi-apk`](../ekspedisi-apk) (lihat "Riwayat"
di bawah untuk detailnya).

## Untuk siapa app ini

Hanya pegawai divisi **Gudang/Warehouse** (`shared_m_divisi.divisi_id = 8`, `kode = 'WH'`) yang
bisa login. Tampilan dibedakan per jabatan:
- **Manajer** atau **SPV** (Supervisor) → role `AdminGudang` (akses penuh, termasuk
  approve Opname).
- **Staff** → role `StaffGudang` (submit Opname perlu approval AdminGudang, tidak lihat
  `qty_system` saat scan supaya hitung manual, bukan nyontek sistem).

Manajer dan SPV **sengaja disamakan** aksesnya untuk sekarang (`AdminGudang`) — lihat
`ROADMAP.md` kalau ini perlu dipisah lagi nanti.

## Menjalankan

```bash
npm install
npm run dev              # dev server Vite, http://localhost:5173
npm run build             # build ke www/ (dibaca Cordova)
npm run cordova:android    # build + jalankan ke device/emulator Android
npm run version:patch      # bump versi (config.xml + package.json + src/lib/app-version.js)
```

Backend yang dipanggil (`src/lib/config.js` → `APP_CONFIG.API_BASE_URL`) saat ini **masih
`backend-production`** — migrasi bertahap ke [`backend-migrasi`](../backend-migrasi) sedang
berjalan, lihat `ROADMAP.md`. Endpoint modul Inventory (Material/Opname/Stock In/Stock Out/
Home Dashboard) memakai prefix `/inventory` yang ditambahkan inline di tiap pemanggil (mis.
`APP_CONFIG.API_BASE_URL + '/inventory/material/get-materials'`) — **tidak ada** base URL
kedua terpisah untuk modul ini (`BASE_API_INVENTORY` sudah dihapus 2026-08-22, lihat "Riwayat").
Endpoint Partner/Logo (dari `sj-apk`) pakai `APP_CONFIG.API_BASE_URL` langsung tanpa prefix.

## Struktur

```
inventory-apk/
├── config.xml, bump-version.cjs, fix-platform-type.cjs   # scaffold Cordova, pola sama persis dgn ekspedisi-apk
├── resources/          # icon.png/splash.png -- logo Koperindo, SAMA PERSIS dgn ekspedisi-apk (byte-identik)
├── src/
│   ├── index.html, main.js
│   ├── lib/              # router (hash-based, WAJIB utk file:// Cordova -- lihat login.js/router.js),
│   │                      # shell (navbar+tab, lihat "Menu" di bawah), dialog/popup/toast/photobrowser
│   │                      # (pengganti Framework7), version-check.js
│   │   ├── config.js         # APP_CONFIG murni (API_BASE_URL/IMAGE_BASE_URL/LOGIN_ENDPOINT) -- TIDAK ADA
│   │   │                      # fungsi apa pun di sini, bentuknya disamakan persis dgn config.js ekspedisi-apk
│   │   ├── format.js         # numberFormat/formatDateShort/formatTimeShort/formatTgl (dipindah dari config.js, 2026-08-22)
│   │   └── auth.js           # checkLogin/logOut (dipindah dari config.js, 2026-08-22)
│   ├── pages/
│   │   ├── login/           # divisi/jabatan gate, quotes, footer -- disamakan strukturnya dgn ekspedisi-apk
│   │   ├── home/             # sub-tab "Data" di bawah tab STOCK -- dashboard ringkasan stok (status ok/low/empty/overstock)
│   │   ├── material/          # master barang (drill-down dari ikon "Master" di Data): list, tambah/edit (+ foto & lokasi rak), hapus
│   │   ├── opname/            # sub-tab "Opname" -- stock take: sesi, scan, submit (role-aware), approve/reject
│   │   ├── stock-in/          # sub-tab "Stock In" -- terima PO
│   │   ├── stock-out/         # sub-tab "Stock Out" -- keluarkan barang (request produksi)
│   │   ├── po/                 # tab "PO" (top-level, sejajar STOCK -- 2026-08-21, sebelumnya ikon di Home) -- placeholder, lihat "Status fitur"
│   │   ├── partner/           # tab "PARTNER" -- transaksi partner (dari sj-apk)
│   │   └── logo/              # tab "LOGO" -- upload foto logo stiker/resin (dari sj-apk)
│   └── styles/main.css       # token warna hijau (brand ekspedisi-apk) + slate netral, lihat ROADMAP.md
└── www/                 # HASIL BUILD (gitignored) -- jangan edit manual
```

## Menu

Empat tab utama (`src/lib/shell.js`): **STOCK** (grup, buka baris sub-tab: Data/Stock In/Stock
Out/Opname), **PO**, **PARTNER**, **LOGO**. Tombol menu tidak aktif berlatar `bg-slate-100`
+ teks `text-slate-700` (2026-08-22, sebelumnya teks polos tanpa latar); aktif jadi
`bg-primary`/teks putih. Master Barang (`/material`) tidak punya tombol sub-tab sendiri —
diakses lewat ikon "Master" di halaman Data — tapi tab STOCK & baris sub-tabnya tetap
kelihatan aktif selagi ada di halaman itu (`STOCK_PATHS` di `shell.js` dipisah dari daftar
tombol yang benar-benar dirender, lihat komentar di file itu).

## Tema & style

Warna (`primary`/`ink`/`surface`) dan gaya halaman login (grid+orb, kartu strip shimmer, judul
app, quotes, footer satu baris) **sengaja disamakan** dengan `ekspedisi-apk` — dua app ini
dimaksudkan terasa satu keluarga visual. Detail keputusan warna (kenapa `gray`→`slate`, kenapa
beberapa elemen TETAP biru/`bg-info` bukan ikut jadi hijau) ada di histori commit & `ROADMAP.md`.

Konvensi tombol & tabel (disamakan lintas STOCK/Master Barang, dan sebagiannya balik disalin ke
`ekspedisi-apk`, lihat README di sana):
- Tombol dasar berwarna **abu-abu** (`bg-slate-*`), bukan cuma teks polos — termasuk tombol
  kolom "Opsi"/"Aksi" di tabel Stock & Master Stock (2026-08-22, sebelumnya teks warna tanpa
  latar di beberapa tempat).
- Filter di Master Barang ditaruh **sejajar** dengan kotak pencarian, bukan baris terpisah.
- Semua sel data di tabel (Master Stock, dst.) pakai `whitespace-nowrap` — konten tidak pernah
  wrap ke baris baru.

## Status fitur

✅ **Sudah ada** (dari migrasi `inventory-app` sebelumnya, terhubung ke API asli): Login, Data
(dashboard stok), Material (list/tambah/edit/hapus), Opname (sesi/scan/submit/approve/detail),
Stock In (terima PO per-item + foto bukti), Stock Out (keluarkan + foto bukti), Partner (list +
popup Material/Terima/Retur/History, dari `sj-apk`), Logo (upload foto Stiker/Resin, dari
`sj-apk`).

⏳ **Belum ada** (fitur sekunder, di luar alur inti terima→simpan→keluar — cari
`// TODO(iterasi berikutnya)` di masing-masing file untuk titik persisnya):
- **PO** — tab top-level sudah ada (`src/pages/po/`), tapi isinya masih **placeholder** (belum
  ada list/detail Purchase Request sungguhan).
- Retur & replacement (ke supplier maupun dari produksi) di Stock In/Stock Out.
- Manual Stock In/Out (transaksi ad-hoc di luar PO/SPK).
- Cetak barcode, export Excel & PDF (Material/Stock In/Opname).
- Scan kamera untuk barcode di Opname (sudah ada fallback input manual yang fungsional).
- Notifikasi FCM.
- Popup Detail SPK di Logo.

## Riwayat (ringkas — detail lengkap di `ROADMAP.md`)

- **2026-08-22**: `src/lib/config.js` disederhanakan — `BASE_API_INVENTORY` (base URL kedua
  khusus modul Inventory) **dihapus**, disatukan lewat `APP_CONFIG.API_BASE_URL` + prefix
  `/inventory` inline per pemanggil (sama pola dgn `/partner/...` yang sudah begitu dari awal).
  `config.js` sekarang murni `APP_CONFIG` (bentuknya disamakan persis dgn `ekspedisi-apk`),
  helper format (`numberFormat`/`formatDateShort`/dst) pindah ke `format.js` baru, dan
  `checkLogin`/`logOut` pindah ke `auth.js` baru. Menu tidak aktif dikasih latar `bg-slate-100`.
- **2026-08-21**: scaffold Cordova dibuat dari `inventory-app` (hasil migrasi Framework7→Vite
  sebelumnya), setup mengikuti pola `ekspedisi-apk` (router jadi hash-based, wajib untuk
  `file://` WebView Cordova — versi `inventory-app` pakai History API, tidak aman di Cordova).
  Tema warna & style login diseragamkan dengan `ekspedisi-apk`. Menu direstruktur: sub-tab Home
  di bawah STOCK diganti nama jadi **Data**, tombol menu master (via ikon di Data) tidak lagi
  mematikan highlight tab STOCK, dan **PO** dipisah jadi tab top-level tersendiri (sebelumnya
  ikon di halaman Home). Auth backend (`backend-migrasi`) mulai dibangun sbg pengganti bertahap
  `backend-production`, dengan Material & Opname ikut diporting — lihat `ROADMAP.md`.
