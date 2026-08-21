import tpl from './login.html?raw';
import './login.css';
import { BASE_API } from '../../lib/config.js';
import { Router } from '../../lib/router.js';
import { CURRENT_APP_VERSION_CODE } from '../../lib/app-version.js';
import { startVersionCheck } from '../../lib/version-check.js';

// [BARU] Role warehouse ditentukan dari kombinasi jabatan + divisi (string
// kode, bukan ID): divisi = 'WH' (Warehouse/Gudang), dan di dalamnya
// jabatan = 'SPV' -> AdminGudang, jabatan = 'STAFF' -> StaffGudang.
// Kombinasi lain (jabatan/divisi apa pun di luar ini) dianggap tidak
// berhak akses app ini.
const DIVISI_GUDANG = 'WH';
const JABATAN_TO_ROLE = {
  SPV: 'AdminGudang',
  STAFF: 'StaffGudang',
};

// Resolve kombinasi jabatan+divisi dari login-new jadi role internal
// ('AdminGudang'/'StaffGudang') yang dipakai di seluruh app ini (Opname,
// Stock In/Out, dst. semuanya masih cek string ini persis). Dibandingkan
// case-insensitive & di-trim, biar tidak gagal cuma gara-gara beda
// besar-kecil huruf dari server. Return null kalau user bukan staff
// gudang -> ditolak masuk.
function resolveGudangRole(jabatan, divisi) {
  const normJabatan = String(jabatan || '').trim().toUpperCase();
  const normDivisi = String(divisi || '').trim().toUpperCase();
  if (normDivisi !== DIVISI_GUDANG) return null;
  return JABATAN_TO_ROLE[normJabatan] || null;
}

export function mount(container) {
  container.innerHTML = tpl;

  document.getElementById('app-navbar').classList.add('hidden');
  document.getElementById('app-tabs').classList.add('hidden');

  jQuery('#btn-login').on('click', getDataUser);
  // Enter di field password langsung submit, seperti kebiasaan form login.
  jQuery('#password').on('keydown', (e) => {
    if (e.key === 'Enter') getDataUser();
  });

  // Toggle show/hide password -- pola sama persis dgn ekspedisi-apk
  // (src/js/pages/login.js), disamakan 2026-08-21.
  jQuery('#toggle-password').on('click', function () {
    const $input = jQuery('#password');
    const isHidden = $input.attr('type') === 'password';
    $input.attr('type', isHidden ? 'text' : 'password');
    jQuery(this).attr('aria-label', isHidden ? 'Sembunyikan password' : 'Tampilkan password');
  });

  function getDataUser() {
    const username = jQuery('#username').val();
    const password = jQuery('#password').val();

    jQuery.ajax({
      type: 'POST',
      url: BASE_API + '/login-new',
      dataType: 'JSON',
      data: { username, password },
      // [FIX] login-new sebenarnya session-based (Set-Cookie di response),
      // TAPI endpoint inventory (/api/inventory/...) yang dipakai SELURUH
      // app ini TIDAK PERNAH baca session -- semua terima user_id sebagai
      // parameter body biasa (lihat routes/api.php grup 'inventory', tidak
      // ada middleware 'auth'/'session' sama sekali). Jadi kita TIDAK
      // BUTUH cookie sesi itu, cuma butuh body JSON-nya.
      //
      // withCredentials SENGAJA tidak diaktifkan: begitu true, browser
      // mewajibkan server balas Access-Control-Allow-Origin dengan origin
      // SPESIFIK (bukan boleh '*') -- itu sumber error CORS yang kemarin
      // muncul terus, padahal kita tidak pernah pakai cookienya. Tanpa
      // withCredentials, request ini jadi "simple CORS request" biasa,
      // sama persis seperti /get-data-login yang sudah terbukti jalan di
      // app lain (produksi-apk, sj-apk).
      beforeSend() {
        app.dialog.preloader('Sedang Memeriksa Data');
      },
      success(res) {
        app.dialog.close();

        if (!res.success) {
          app.dialog.alert(res.message || 'Username atau password salah');
          return;
        }

        const data = res.data;
        const role = resolveGudangRole(data.jabatan, data.divisi);

        if (!role) {
          app.dialog.alert('Jabatan tidak sesuai untuk mengakses aplikasi ini');
          return;
        }

        localStorage.setItem('valid_app_version', String(CURRENT_APP_VERSION_CODE));
        localStorage.setItem('user_id', data.user_id);
        localStorage.setItem('username', data.username);
        localStorage.setItem('karyawan_nama', data.nama_lengkap);
        localStorage.setItem('login', 'true');
        // Simpan hasil RESOLVE (AdminGudang/StaffGudang), bukan kode jabatan
        // mentah dari server -- supaya seluruh kode lain di app ini
        // (Opname, Stock In/Out, dst.) yang cek localStorage.jabatan tetap
        // jalan tanpa perlu diubah satu pun.
        localStorage.setItem('jabatan', role);
        localStorage.setItem('lokasi_pabrik', data.pabrik);
        localStorage.setItem('department_id', 1);
        localStorage.setItem('warehouse_id', 1);
        // [PERMINTAAN] id_pabrik (angka) sengaja tidak disimpan -- cukup
        // namanya (lokasi_pabrik). user_id TETAP disimpan (beda dari
        // id_pabrik): dipakai sebagai parameter wajib di endpoint Material,
        // Opname, Stock In/Out, Logo untuk atribusi data (siapa yang input).

        startVersionCheck();
        Router.navigate('/home');
      },
      error(xhr) {
        app.dialog.close();
        const res = xhr.responseJSON;
        app.dialog.alert((res && res.message) || 'Terjadi kesalahan, coba lagi');
      },
    });
  }

  // unmount: tidak ada listener global yang perlu dilepas di halaman ini.
  return () => { };
}