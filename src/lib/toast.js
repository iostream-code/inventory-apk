// Pengganti `app.toast.create({text, position, closeTimeout, cssClass}).open()`.

const overlays = document.getElementById('app-overlays');
const ANIM_MS = 150;

const colorFor = (cssClass = '') => {
  if (cssClass.includes('green')) return 'bg-success';
  if (cssClass.includes('red')) return 'bg-danger';
  if (cssClass.includes('orange') || cssClass.includes('yellow')) return 'bg-warning';
  return 'bg-ink-primary';
};

export const toast = {
  create({ text, position = 'center', closeTimeout = 2000, cssClass = '' } = {}) {
    return {
      open() {
        const el = document.createElement('div');
        const posClass = position === 'top'
          ? 'top-6'
          : position === 'bottom'
            ? 'bottom-6'
            : 'top-1/2 -translate-y-1/2';
        el.className = `fixed left-1/2 -translate-x-1/2 ${posClass} z-[300] px-4 py-2 rounded-md text-white text-sm font-medium shadow-lg ${colorFor(cssClass)} opacity-0 scale-95 transition-all duration-150 ease-out`;
        el.textContent = text;
        overlays.appendChild(el);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => el.classList.remove('opacity-0', 'scale-95'));
        });

        setTimeout(() => {
          el.classList.add('opacity-0', 'scale-95');
          setTimeout(() => el.remove(), ANIM_MS);
        }, closeTimeout);
      },
    };
  },
};
