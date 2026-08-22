// Helper format tampilan (angka, tanggal, jam) -- dipindah keluar dari
// config.js (2026-08-22, config.js sekarang murni APP_CONFIG, bentuk file
// disamakan dgn ekspedisi-apk yang juga punya format.js terpisah dari
// config.js di sana, lihat src/js/format.js/config.js sana).
//
// Porting dari inventory-apk/www/js/global.js — hanya bagian konstanta &
// helper murni (tanpa dependency ke Cordova/F7).

export function numberFormat(number, decimals = 0, decPoint = '.', thousandsSep = ',') {
  number = (number + '').replace(/[^0-9+\-Ee.]/g, '');
  const n = !isFinite(+number) ? 0 : +number;
  const prec = !isFinite(+decimals) ? 0 : Math.abs(decimals);
  const toFixedFix = (n, prec) => {
    const k = Math.pow(10, prec);
    return '' + Math.round(n * k) / k;
  };
  let s = (prec ? toFixedFix(n, prec) : '' + Math.round(n)).split('.');
  if (s[0].length > 3) {
    s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, thousandsSep);
  }
  if ((s[1] || '').length < prec) {
    s[1] = s[1] || '';
    s[1] += new Array(prec - s[1].length + 1).join('0');
  }
  return s.join(decPoint);
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
// Semua 3-huruf pertama BULAN kebetulan sudah jadi singkatan yang wajar
// dalam Bahasa Indonesia (Jan, Feb, ..., Agu, ..., Des), jadi tinggal
// di-slice, tidak perlu array terpisah.
const BULAN_SINGKAT = BULAN.map((b) => b.slice(0, 3));

/**
 * Format tanggal pendek baku dipakai di SELURUH app: "13-Agu-26".
 * Global supaya konsisten di semua menu (sebelumnya tiap halaman punya
 * format sendiri-sendiri -- ada yg toLocaleDateString('id-ID') polos, ada
 * yg { day, month: 'short', year: 'numeric' } dgn nama bulan Inggris/
 * Indonesia campur-campur tergantung browser).
 *
 * Terima Date object ATAU string (ISO "YYYY-MM-DD[ HH:mm:ss]", atau apapun
 * yang bisa di-parse `new Date()`). Kosong/tidak valid -> fallback ('-').
 *
 * CATATAN: ini KHUSUS utk tanggal yang DITAMPILKAN ke user. Jangan dipakai
 * utk membangun kode/ID (mis. kode SPK "ddmmyy-nomor") atau utk mengisi
 * `<input type="date">` (yg wajib format ISO "YYYY-MM-DD") -- itu beda
 * kebutuhan, tetap pakai format aslinya masing-masing.
 */
export function formatDateShort(dateInput, fallback = '-') {
  if (!dateInput) return fallback;
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return fallback;
  const day = String(d.getDate()).padStart(2, '0');
  const month = BULAN_SINGKAT[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

/**
 * Format jam pendek baku dipakai di SELURUH app: "11:43:00" (pemisah ":",
 * BUKAN "." -- toLocaleTimeString('id-ID') bawaan browser pakai "."
 * sebagai pemisah jam, itu sumber ketidak-konsistenan sebelumnya).
 */
export function formatTimeShort(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '-';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatTgl(dateStr) {
  if (!dateStr || dateStr === '-') return '-';
  let d;
  if (dateStr instanceof Date) {
    d = dateStr;
  } else {
    const str = String(dateStr).trim();
    const partsA = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (partsA) {
      d = new Date(parseInt(partsA[1]), parseInt(partsA[2]) - 1, parseInt(partsA[3]));
    } else {
      const partsB = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
      d = partsB
        ? new Date(parseInt(partsB[3]), parseInt(partsB[2]) - 1, parseInt(partsB[1]))
        : new Date(str);
    }
  }
  if (!d || isNaN(d.getTime())) return String(dateStr);
  return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
}
