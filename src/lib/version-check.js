// Cek versi app lewat controller Config/* (POST /inventory/config/check-version,
// backend-migrasi -- ConfigController::CONFIG_ID='VERSION_INVENTORY_PUSAT',
// hardcoded per modul, TIDAK baca `app_name` dari body sama sekali, beda dari
// backend-production/VersionController::$configIdMap yang dulu jadi acuan pola
// endpoint ini; `app_name` di bawah tetap dikirim tapi cuma diabaikan, tidak
// perlu dihapus).
//
// [BARU] Dipakai SEKALIGUS sebagai indikator koneksi (#box_internet) --
// app lama (inventory-apk/sj-apk/produksi-apk) punya polling terpisah
// (checkInternet(), tiap 10 detik ke endpoint /ping atau /check-internet)
// khusus buat nyalain-matiin titik itu. Di sini kita TIDAK bikin polling
// baru; berhasil/gagalnya request check-version yang SUDAH jalan tiap 30
// detik ini sekalian jadi sinyal "ada internet atau tidak" -- lebih
// sederhana, satu request buat dua keperluan.

import { APP_CONFIG } from './config.js';
import { logOut } from './auth.js';

const APP_NAME = 'inventory';
const CHECK_INTERVAL_MS = 30000; // sama seperti produksi-apk: tiap 30 detik

let intervalId = null;

function setConnectionIndicator(isConnected) {
    const box = document.getElementById('box_internet');
    if (!box) return;
    // Toggle class .connected/.disconnected (bukan inline style.backgroundColor
    // polos) -- isian topbar disamakan dgn ekspedisi-apk 2026-08-22, styling
    // (dashed ring + glow pulsing) ada di .connection-indicator/main.css.
    box.classList.toggle('connected', isConnected);
    box.classList.toggle('disconnected', !isConnected);
}

function checkAppVersion() {
    jQuery.ajax({
        type: 'POST',
        // [FIX 2026-08-22] Sebelumnya tanpa prefix '/inventory' -- benar untuk
        // backend-production (Config module top-level, bukan bagian dari modul
        // manapun), TAPI salah untuk backend-migrasi: di sana ConfigController
        // modul Inventory cuma terdaftar di `/inventory/config/check-version`
        // (lihat backend-migrasi/src/Inventory/routes.php), tidak ada route
        // top-level `/config/check-version` sama sekali -- selalu 404 kalau
        // API_BASE_URL diarahkan ke backend-migrasi (lihat config.js).
        url: APP_CONFIG.API_BASE_URL + '/inventory/config/check-version',
        dataType: 'JSON',
        data: {
            app_name: APP_NAME,
            current_version_code: localStorage.getItem('valid_app_version'),
        },
        success(data) {
            setConnectionIndicator(true);

            if (data.status === 'success' && !data.is_valid) {
                app.dialog.alert(data.config.config_keterangan, () => {
                    logOut();
                });
            }
        },
        error() {
            // Beda dari sebelumnya: request gagal (timeout/tidak ada internet/
            // server tidak terjangkau) TETAP dipakai sebagai sinyal "putus" utk
            // indikator, tapi TIDAK menampilkan alert apa pun ke user -- jangan
            // ganggu cuma karena satu kali polling gagal. Dicoba lagi 30 detik
            // berikutnya seperti biasa.
            setConnectionIndicator(false);
        },
    });
}

export function startVersionCheck() {
    if (intervalId) clearInterval(intervalId);
    checkAppVersion(); // cek langsung sekali saat dipanggil, jangan tunggu 30 detik pertama
    intervalId = setInterval(checkAppVersion, CHECK_INTERVAL_MS);
}

export function stopVersionCheck() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
}