// Simpan/buka blob PDF -- port dari purchase-finance-apk/src/js/pdfReport.js
// (fungsi isCordova/waitForDeviceReady/browserDownload/cordovaSaveAndOpen/
// savePdf, sudah terbukti jalan di produksi sana), sengaja dipisah jadi
// helper generic terpisah dari isi PDF-nya sendiri (lihat barcodeLabels.js)
// supaya bisa dipakai fitur export PDF lain nanti (Stock In/Opname -- masih
// backlog, lihat README.md).
//
// Notifikasi pakai app.dialog.alert/app.toast (global window.app dari
// app-shim.js, sudah tersedia di semua page module app ini) -- BUKAN modul
// Toast terpisah spt di purchase-finance-apk.

// Penting: cek `window.cordova` saja -- jangan bergantung ke `cordova.file`,
// karena `cordova.file` baru terisi SETELAH event `deviceready` dipicu
// plugin. Kalau user klik cetak sebelum deviceready, logika ini bisa salah
// jatuh ke browser-fallback yang TIDAK jalan di Android WebView (atribut
// `download` pada <a> diabaikan WebView).
function isCordova() {
    return !!(
        window.cordova ||
        window._cordovaNative ||
        /cordova|phonegap/i.test(navigator.userAgent || '')
    );
}

function waitForDeviceReady() {
    return new Promise((resolve) => {
        if (!isCordova()) { resolve(); return; }
        if (window.cordova && window.cordova.file) { resolve(); return; }
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        document.addEventListener('deviceready', finish, { once: true });
        setTimeout(finish, 5000); // safety net
    });
}

// ── Browser fallback: <a download> ────────────────────────────────
function browserDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ── Cordova: simpan ke storage device, lalu buka via fileOpener2 ────
function cordovaSaveAndOpen(blob, filename) {
    return new Promise((resolve, reject) => {
        // dataDirectory = internal app storage, tidak butuh WRITE_EXTERNAL
        // permission, lebih reliable di Android 10+ (scoped storage).
        const dir = window.cordova.file.dataDirectory || window.cordova.file.externalDataDirectory;

        if (!dir || typeof window.resolveLocalFileSystemURL !== 'function') {
            reject(new Error('cordova-plugin-file belum aktif.'));
            return;
        }

        window.resolveLocalFileSystemURL(dir, (dirEntry) => {
            dirEntry.getFile(filename, { create: true, exclusive: false }, (fileEntry) => {
                fileEntry.createWriter((writer) => {
                    writer.onwriteend = () => {
                        const nativePath = fileEntry.nativeURL; // file:///...
                        const fileOpen = window.cordova.plugins && window.cordova.plugins.fileOpener2;
                        if (!fileOpen || !fileOpen.open) {
                            resolve({ nativePath, opened: false });
                            return;
                        }
                        fileOpen.open(nativePath, 'application/pdf', {
                            showOpenWithDialog: true,
                            success: () => resolve({ nativePath, opened: true }),
                            error: (e) => {
                                console.error('[pdfSave] fileOpener2 error:', JSON.stringify(e));
                                resolve({ nativePath, opened: false });
                            },
                        });
                    };
                    writer.onerror = (e) => reject(new Error('Write gagal: ' + ((e && e.target && e.target.error && e.target.error.message) || 'unknown')));
                    writer.write(blob);
                }, (e) => reject(new Error('createWriter gagal: ' + ((e && e.code) || 'unknown'))));
            }, (e) => reject(new Error('getFile gagal: ' + ((e && e.code) || 'unknown'))));
        }, (e) => reject(new Error('resolveURL gagal: ' + ((e && e.code) || 'unknown'))));
    });
}

function notifySuccess(text) {
    app.toast.create({ text: '✓ ' + text, position: 'center', closeTimeout: 2500 }).open();
}

// ── Public: simpan doc jsPDF ke file, buka otomatis kalau bisa ─────
export async function savePdf(doc, filename) {
    const blob = doc.output('blob');

    if (isCordova()) {
        await waitForDeviceReady();

        if (!window.cordova || !window.cordova.file) {
            app.dialog.alert('Plugin cordova-plugin-file belum aktif.');
            return;
        }

        let saved = false;
        try {
            const result = await cordovaSaveAndOpen(blob, filename);
            saved = true;

            if (result.opened) {
                notifySuccess(`PDF tersimpan: ${filename}`);
                return;
            }

            // fileOpener2 gagal (tidak ada PDF reader / FileProvider issue) --
            // fallback 1: window.open _system dengan native path.
            try {
                window.open(result.nativePath, '_system');
                notifySuccess(`PDF tersimpan: ${filename}`);
                return;
            } catch (_) { /* lanjut ke fallback 2 */ }
        } catch (err) {
            console.error('[pdfSave] cordovaSaveAndOpen error:', err);
        }

        // Fallback 2 (paling reliable) -- buka sebagai base64 data URI, tidak
        // butuh file permission/FileProvider sama sekali.
        try {
            const dataUri = doc.output('datauristring');
            const ref = window.cordova.InAppBrowser
                ? window.cordova.InAppBrowser.open(dataUri, '_blank', 'location=yes,toolbar=yes,closebuttoncaption=Tutup')
                : window.open(dataUri, '_blank');
            if (!ref) throw new Error('InAppBrowser tidak tersedia');
            notifySuccess(saved ? `PDF tersimpan: ${filename}` : 'Membuka PDF...');
        } catch (e2) {
            console.error('[pdfSave] base64 fallback error:', e2);
            app.dialog.alert('Gagal membuka PDF. Cek logcat untuk detail.');
        }
        return;
    }

    // Browser biasa (dev server)
    browserDownload(blob, filename);
    notifySuccess(`PDF: ${filename}`);
}
