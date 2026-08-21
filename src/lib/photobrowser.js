// Pengganti `app.photoBrowser.create({photos:[...]}).open()` — dipakai untuk
// zoom foto (mis. bukti stok). Implementasi minimal: lightbox 1 gambar.

const overlays = document.getElementById('app-overlays');
const ANIM_MS = 200;

export const photoBrowser = {
  create({ photos = [] } = {}) {
    return {
      open() {
        if (!photos.length) return;
        const el = document.createElement('div');
        el.className = 'app-overlay-backdrop fixed inset-0 z-[250] bg-black/90 flex items-center justify-center p-4';
        el.innerHTML = `
          <img src="${photos[0]}" class="app-overlay-panel max-w-full max-h-full object-contain" />
          <button class="absolute top-4 right-4 text-white text-2xl leading-none">&times;</button>
        `;
        const close = () => {
          el.classList.remove('is-open');
          setTimeout(() => el.remove(), ANIM_MS);
        };
        el.querySelector('button').addEventListener('click', close);
        el.addEventListener('click', (e) => { if (e.target === el) close(); });
        overlays.appendChild(el);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => el.classList.add('is-open'));
        });
      },
    };
  },
};
