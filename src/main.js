import $ from 'jquery';
window.$ = window.jQuery = $;

import './styles/main.css';
import './lib/app-shim.js'; // harus di-import sebelum page module manapun (menyediakan window.app)

import { Router, startRouter } from './lib/router.js';
import { renderShell } from './lib/shell.js';
import { checkLogin, initAuthInterceptor } from './lib/auth.js';
import { startVersionCheck } from './lib/version-check.js';

// Harus dipasang sebelum request /inventory/* apa pun (termasuk yang
// dipicu startVersionCheck() di bawah) -- lihat auth.js utk detail.
initAuthInterceptor();

import * as LoginPage from './pages/login/login.js';
import * as HomePage from './pages/home/home.js';
import * as MaterialPage from './pages/material/material.js';
import * as OpnamePage from './pages/opname/opname.js';
import * as StockInPage from './pages/stock-in/stock-in.js';
import * as StockOutPage from './pages/stock-out/stock-out.js';
import * as PartnerPage from './pages/partner/partner.js';
import * as LogoPage from './pages/logo/logo.js';
import * as PoPage from './pages/po/po.js';

// TODO iterasi berikutnya (lihat README untuk detail simplifikasi per halaman):
// retur/replacement Stock In (ke supplier + replacement), notifikasi FCM,
// export Excel/PDF (Stock In/Opname). Retur Produksi (Stock Out), manual
// stock in/out, purchase request list, dan cetak barcode (Material) SUDAH
// selesai -- lihat README/ROADMAP.md.

renderShell();

Router.register('/login', {
  mount: (container) => LoginPage.mount(container),
});

function authedRoute(PageModule) {
  return {
    mount: (container) => {
      if (!checkLogin()) { Router.navigate('/login'); return () => { }; }
      return PageModule.mount(container);
    },
  };
}

Router.register('/home', authedRoute(HomePage));
Router.register('/material', authedRoute(MaterialPage));
Router.register('/opname', authedRoute(OpnamePage));
Router.register('/stock-in', authedRoute(StockInPage));
Router.register('/stock-out', authedRoute(StockOutPage));
Router.register('/partner', authedRoute(PartnerPage));
Router.register('/logo', authedRoute(LogoPage));
Router.register('/po', authedRoute(PoPage));

startRouter(checkLogin() ? '/home' : '/login');

// Refresh halaman saat masih login (bukan baru login) juga tetap perlu
// version-check jalan -- login.js hanya start-kan untuk kasus baru login.
if (checkLogin()) startVersionCheck();