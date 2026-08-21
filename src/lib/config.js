// Porting dari inventory-apk/www/js/global.js — hanya bagian konstanta &
// helper murni (tanpa dependency ke Cordova/F7). Fungsi yang berhubungan
// dengan UI (checkConnection, getPlayAudio, dst.) akan dipindah saat
// halaman terkait dimigrasikan.

export const BASE_API = 'https://indokoper.com/api';
export const BASE_API_INVENTORY = 'https://indokoper.com/api/inventory';
export const BASE_GAMBAR = 'https://indokoper.com';

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

export function checkLogin() {
  if (localStorage.getItem('login') !== 'true') {
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