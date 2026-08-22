import tpl from './po.html?raw';
import { showAuthedShell } from '../../lib/shell.js';

/**
 * Tab PO -- dipisah dari halaman Data (2026-08-22, sebelumnya "Request PO"
 * cuma ikon "Daftar Request Order" + floating bar di home.js). Placeholder
 * dulu, belum ada data/aksi nyata -- lihat TODO di home.js untuk daftar
 * fitur yang akan dipindah ke sini.
 */
export function mount(container) {
  container.innerHTML = tpl;
  showAuthedShell('/po');

  jQuery('#btn-po-refresh').on('click', () => {
    app.toast.create({ text: 'Belum ada data untuk di-refresh.' }).open();
  });

  return () => {};
}
