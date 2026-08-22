import tpl from './login.html?raw';
import './login.css';
import { APP_CONFIG } from '../../lib/config.js';
import { Router } from '../../lib/router.js';
import { CURRENT_APP_VERSION_CODE } from '../../lib/app-version.js';
import { startVersionCheck } from '../../lib/version-check.js';

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
      // [FIX 2026-08-22] LOGIN_ENDPOINT ('/login') dulu dipanggil TANPA
      // prefix '/inventory' -- di backend-migrasi itu jatuh ke `/login`
      // milik modul EKSPEDISI (flat, tanpa prefix, lihat
      // backend-migrasi/src/Ekspedisi/Controllers/AuthController.php),
      // BUKAN Inventory (`/inventory/login`). Login pakai akun gudang tetap
      // "berhasil" nyambung ke server tapi balikin bentuk response
      // Ekspedisi ({token,role,user:{id,name}}, tanpa divisi/jabatan/pabrik)
      // -- makanya kredensial benar tetap tidak pernah redirect. Prefix
      // '/inventory' ditambah di sini (bukan diubah nilainya di
      // config.js, LOGIN_ENDPOINT sengaja tetap '/login') supaya konsisten
      // dgn pola endpoint modul Inventory lain (prefix ditambah per
      // pemanggil, lihat material.js/opname.js/dst).
      url: APP_CONFIG.API_BASE_URL + '/inventory' + APP_CONFIG.LOGIN_ENDPOINT,
      dataType: 'JSON',
      data: { username, password },
      beforeSend() {
        app.dialog.preloader('Sedang Memeriksa Data');
      },
      success(res) {
        app.dialog.close();

        // role SELALU dari server (res.role) -- Inventory AuthController di
        // backend-migrasi SUDAH gate divisi Gudang (divisi_id=8, kode='WH')
        // + resolve jabatan->role ('AdminGudang'/'StaffGudang') di sisi
        // server (kombinasi jabatan/divisi apa pun di luar itu ditolak
        // duluan dgn HTTP 403, masuk ke error() di bawah, bukan sampai
        // sini). Klien tidak perlu (dan tidak boleh) menduga-duga sendiri
        // dari jabatan/divisi mentah -- beda dari versi sebelumnya yang
        // resolve ulang di FE (resolveGudangRole(), sudah dihapus).
        localStorage.setItem('valid_app_version', String(CURRENT_APP_VERSION_CODE));
        localStorage.setItem('token', res.token);
        localStorage.setItem('user_id', res.user.id);
        localStorage.setItem('username', res.user.username);
        localStorage.setItem('karyawan_nama', res.user.name);
        localStorage.setItem('login', 'true');
        localStorage.setItem('jabatan', res.role);
        localStorage.setItem('lokasi_pabrik', res.user.pabrik);
        localStorage.setItem('department_id', 1);
        localStorage.setItem('warehouse_id', 1);
        // [PERMINTAAN] id_pabrik (angka) sengaja tidak disimpan -- cukup
        // namanya (lokasi_pabrik). user_id TETAP disimpan (beda dari
        // id_pabrik): dipakai sebagai parameter wajib di endpoint Material,
        // Opname, Stock In/Out, Logo untuk atribusi data (siapa yang input).

        startVersionCheck();
        Router.navigate('/home');
      },
      // Backend-migrasi (beda dari backend-production) signal kegagalan
      // lewat HTTP status code (401/403/422 + body {message}), BUKAN 200
      // + {success:false} -- makanya semua kasus gagal (password salah,
      // jabatan/divisi tidak sesuai, dst.) masuk sini, bukan ke success().
      error(xhr) {
        app.dialog.close();
        const res = xhr.responseJSON;
        app.dialog.alert((res && res.message) || 'Username atau password salah');
      },
    });
  }

  // unmount: tidak ada listener global yang perlu dilepas di halaman ini.
  return () => { };
}