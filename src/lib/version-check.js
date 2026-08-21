// Cek versi app lewat controller Config/* (POST /config/check-version).
// Pola & endpoint SAMA seperti produksi-apk (js/global.js checkAppVersion()),
// bedanya app_name di sini 'inventory' (lihat mapping baru di backend
// VersionController::$configIdMap).
//
// [BARU] Dipakai SEKALIGUS sebagai indikator koneksi (#box_internet) --
// app lama (inventory-apk/sj-apk/produksi-apk) punya polling terpisah
// (checkInternet(), tiap 10 detik ke endpoint /ping atau /check-internet)
// khusus buat nyalain-matiin titik itu. Di sini kita TIDAK bikin polling
// baru; berhasil/gagalnya request check-version yang SUDAH jalan tiap 30
// detik ini sekalian jadi sinyal "ada internet atau tidak" -- lebih
// sederhana, satu request buat dua keperluan.

import { BASE_API } from './config.js';
import { logOut } from './config.js';

const APP_NAME = 'inventory';
const CHECK_INTERVAL_MS = 30000; // sama seperti produksi-apk: tiap 30 detik

let intervalId = null;

function setConnectionIndicator(isConnected) {
    const box = document.getElementById('box_internet');
    if (!box) return;
    // Konvensi warna sama seperti app lama: hijau = terhubung, merah = putus.
    box.style.backgroundColor = isConnected ? '#22c55e' : '#ef4444';
}

function checkAppVersion() {
    jQuery.ajax({
        type: 'POST',
        url: BASE_API + '/config/check-version',
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