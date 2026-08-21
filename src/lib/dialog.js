// Pengganti `app.dialog.*` dari Framework7 — dipakai luas di kode lama
// (app.dialog.alert, app.dialog.confirm, app.dialog.preloader, app.dialog.close).
// Dibuat custom dengan Tailwind, tapi API-nya sengaja dibuat mirip supaya
// business-logic lama (home.js, stock-in.js, dst.) bisa dipindah nanti
// tanpa ditulis ulang total.
//
// Animasi sama seperti popup.js: backdrop fade + panel scale/slide-up
// (class .app-overlay-backdrop / .app-overlay-panel di src/styles/main.css).

const overlays = document.getElementById('app-overlays');
const ANIM_MS = 200;
let activeEl = null;

function closeActive() {
  if (!activeEl) return;
  const el = activeEl;
  activeEl = null;
  el.classList.remove('is-open');
  setTimeout(() => el.remove(), ANIM_MS);
}

function baseOverlay(innerHtml) {
  closeActive();
  const wrap = document.createElement('div');
  wrap.className = 'app-overlay-backdrop fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-6';
  wrap.innerHTML = `<div class="app-overlay-panel">${innerHtml}</div>`;
  overlays.appendChild(wrap);
  activeEl = wrap;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => wrap.classList.add('is-open'));
  });

  return wrap;
}

export const dialog = {
  preloader(text = 'Harap Tunggu') {
    baseOverlay(`
      <div class="bg-white rounded-lg px-6 py-5 flex flex-col items-center gap-3 shadow-xl min-w-[160px]">
        <div class="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <div class="text-sm text-ink-secondary text-center">${text}</div>
      </div>
    `);
  },

  alert(text, titleOrCb, maybeCb) {
    // Sama seperti F7: alert(text, cb) ATAU alert(text, title, cb)
    let title = 'Pemberitahuan';
    let cb = null;
    if (typeof titleOrCb === 'function') cb = titleOrCb;
    else {
      if (titleOrCb) title = titleOrCb;
      if (typeof maybeCb === 'function') cb = maybeCb;
    }

    const el = baseOverlay(`
      <div class="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
        <div class="px-5 pt-4 pb-2">
          <div class="font-bold text-ink-primary mb-1">${title}</div>
          <div class="text-sm text-ink-secondary">${text}</div>
        </div>
        <div class="border-t border-ink-faint px-4 py-2 flex justify-end">
          <button data-act="ok" class="px-4 py-1.5 text-sm font-semibold text-primary hover:bg-primary/5 rounded">OK</button>
        </div>
      </div>
    `);
    el.querySelector('[data-act="ok"]').addEventListener('click', () => {
      closeActive();
      if (cb) cb();
    });
  },

  confirm(text, title, yesCb, noCb) {
    if (typeof title === 'function') {
      noCb = yesCb;
      yesCb = title;
      title = 'Konfirmasi';
    }
    const el = baseOverlay(`
      <div class="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
        <div class="px-5 pt-4 pb-2">
          <div class="font-bold text-ink-primary mb-1">${title || 'Konfirmasi'}</div>
          <div class="text-sm text-ink-secondary">${text}</div>
        </div>
        <div class="border-t border-ink-faint px-2 py-2 flex justify-end gap-1">
          <button data-act="no" class="px-4 py-1.5 text-sm font-semibold text-ink-secondary hover:bg-black/5 rounded">Batal</button>
          <button data-act="yes" class="px-4 py-1.5 text-sm font-semibold text-primary hover:bg-primary/5 rounded">Ya</button>
        </div>
      </div>
    `);
    el.querySelector('[data-act="yes"]').addEventListener('click', () => { closeActive(); if (yesCb) yesCb(); });
    el.querySelector('[data-act="no"]').addEventListener('click', () => { closeActive(); if (noCb) noCb(); });
  },

  close() {
    closeActive();
  },
};
