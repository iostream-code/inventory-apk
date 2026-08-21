// "Kompatibilitas shim" — supaya file JS lama (home.js, stock-in.js,
// stock-out.js, opname.js, material.js, notification.js) yang tersebar
// memanggil `app.dialog.alert(...)`, `app.popup.open(...)`,
// `app.views.main.router.navigate(...)`, dst. bisa dipindah ke sini
// belakangan dengan perubahan seminim mungkin, TANPA harus menulis ulang
// setiap pemanggilan `app.*` satu per satu.
//
// Ini bukan berarti kita masih pakai Framework7 — semua implementasi di
// balik `app.dialog`, `app.popup`, dst. adalah kode kita sendiri
// (lihat dialog.js / popup.js / toast.js / photobrowser.js).

import { dialog } from './dialog.js';
import { popup } from './popup.js';
import { toast } from './toast.js';
import { photoBrowser } from './photobrowser.js';
import { Router } from './router.js';

window.app = {
  dialog,
  popup,
  toast,
  photoBrowser,
  views: {
    main: {
      router: {
        navigate: (path, opts) => Router.navigate(path, opts),
        get currentRoute() { return Router.currentRoute; },
      },
    },
  },
};
