import tpl from './logo.html?raw';
import { APP_CONFIG } from '../../lib/config.js';
import { numberFormat, formatDateShort } from '../../lib/format.js';
import { showAuthedShell } from '../../lib/shell.js';

function escHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function removePrefix(str, prefix = 'INV_') {
    if (!str) return '-';
    return str.toString().replace(prefix, '').replace(/^0/, '');
}
// KHUSUS pembentuk kode SPK ("ddmmyy-nomor", mis. "130826-123") -- BUKAN
// tanggal yang ditampilkan ke user, jadi TIDAK ikut diseragamkan ke format
// formatDateShort() global (lihat catatan di lib/config.js).
function ddmmyy(d) {
    if (!d) return '';
    const dt = new Date(d);
    return String(dt.getDate()).padStart(2, '0') + String(dt.getMonth() + 1).padStart(2, '0') + String(dt.getFullYear()).slice(-2);
}

const ITEMS_PER_PAGE = 20;

export function mount(container) {
    container.innerHTML = tpl;
    showAuthedShell('/logo');

    const state = { all: [], filtered: [], currentPage: 1 };
    const photo = { type: null, id: null, dataUrl: null };

    // ── Events ──────────────────────────────────────────────
    jQuery('#btn-logo-refresh').on('click', fetchList);
    jQuery('#perusahaan_logo_filter, #type_logo_filter').on('input', applyFilter);
    jQuery('#bantuan_logo_filter').on('change', applyFilter);

    jQuery('#logo_value').on('click', '.btn-logo-stiker', function () {
        openPhotoPopup('stiker', jQuery(this).data('id'), jQuery(this).data('current'));
    });
    jQuery('#logo_value').on('click', '.btn-logo-resin', function () {
        openPhotoPopup('resin', jQuery(this).data('id'), jQuery(this).data('current'));
    });
    jQuery('#logo_photo_input').on('change', function () { onPhotoSelected(this); });
    jQuery('#btn-logo-photo-save').on('click', savePhoto);

    jQuery('#tombol_paginasi_logo').on('click', '.pag-btn', function () {
        state.currentPage = parseInt(jQuery(this).data('page'));
        renderPage();
    });

    // ── Data loading ─────────────────────────────────────────
    function fetchList() {
        jQuery('#perusahaan_logo_filter').val(''); jQuery('#type_logo_filter').val(''); jQuery('#bantuan_logo_filter').val('');
        app.dialog.preloader('Mengambil Data Logo...');
        jQuery('#logo_value').html('');

        jQuery.ajax({
            type: 'POST', url: APP_CONFIG.API_BASE_URL + '/get-data-purchase', dataType: 'JSON',
            data: {
                karyawan_id: localStorage.getItem('user_id'),
                perusahaan_purchase_value: 'empty', type_purchase_filter: 'empty',
                warna_purchase_filter: 'empty', bantuan_purchase_filter: 'empty',
            },
            success(data) {
                app.dialog.close();
                // Hanya item jenis "HC" yang belum lengkap foto stiker/resin-nya
                // (persis logika filter di app lama).
                state.all = (data.data || []).filter((v) =>
                    (v.penjualan_jenis || '').indexOf('HC') !== -1 &&
                    (v.foto_purchase_logo_selesai == null || v.foto_resin_selesai == null)
                );
                // SPK terbaru dulu (DESC). Backend /get-data-purchase sengaja
                // ORDER BY penjualan_id ASC (endpoint dipakai bareng halaman
                // produksi utk antrian FIFO) -- jadi di-reverse di sini saja,
                // khusus utk tampilan Logo, bukan diubah di backend.
                // penjualan_id formatnya "INV_" + 5 digit angka rata (fixed-
                // width, lihat generator ID di CrmController), jadi aman
                // di-sort sbg string.
                state.all.sort((a, b) => String(b.penjualan_id || '').localeCompare(String(a.penjualan_id || '')));
                applyFilter();
            },
            error() { app.dialog.close(); jQuery('#logo_count').text(0); app.dialog.alert('Gagal memuat data'); },
        });
    }

    function applyFilter() {
        const perusahaan = (jQuery('#perusahaan_logo_filter').val() || '').toLowerCase().trim();
        const type = (jQuery('#type_logo_filter').val() || '').toLowerCase().trim();
        const bantuan = jQuery('#bantuan_logo_filter').val();

        state.filtered = state.all.filter((v) => {
            if (perusahaan && !(v.client_nama || '').toLowerCase().includes(perusahaan)) return false;
            if (type && !(v.penjualan_jenis || '').toLowerCase().includes(type)) return false;
            if (bantuan && (v.bantuan_cabang || 'Surabaya') !== bantuan) return false;
            return true;
        });
        state.currentPage = 1;
        renderPage();
    }

    function renderPage() {
        const totalPages = Math.max(1, Math.ceil(state.filtered.length / ITEMS_PER_PAGE));
        state.currentPage = Math.min(state.currentPage, totalPages);
        const start = (state.currentPage - 1) * ITEMS_PER_PAGE;
        const slice = state.filtered.slice(start, start + ITEMS_PER_PAGE);

        jQuery('#logo_count').text(state.filtered.length);

        if (!slice.length) {
            jQuery('#logo_value').html('<tr><td colspan="8" class="tbl-empty">Data kosong</td></tr>');
            jQuery('#tombol_paginasi_logo').html('');
            return;
        }

        const now = new Date();
        jQuery('#logo_value').html(slice.map((v, i) => {
            const deadline10 = v.penjualan_tanggal_kirim ? new Date(v.penjualan_tanggal_kirim) : null;
            if (deadline10) deadline10.setDate(deadline10.getDate() - 10);
            const isLate = deadline10 && now >= deadline10;

            const stikerDone = v.foto_purchase_logo_selesai != null;
            const resinDone = v.foto_resin_selesai != null;

            return `
        <tr class="${isLate ? 'bg-red-50' : ''}">
          <td class="td-center font-semibold">${start + i + 1}</td>
          <td class="td-center whitespace-nowrap ${isLate ? 'text-danger font-bold' : ''}">${deadline10 ? formatDateShort(deadline10) : '-'}</td>
          <td class="td-left font-bold text-primary-brand whitespace-nowrap">${ddmmyy(v.penjualan_tanggal)}-${escHtml(removePrefix(v.penjualan_id))}</td>
          <td class="td-left font-semibold">${escHtml(v.client_nama || '-')}</td>
          <td class="td-left">${escHtml(v.penjualan_jenis || '-')}</td>
          <td class="td-center">${numberFormat(v.penjualan_qty || 0, 0, ',', '.')}</td>
          <td class="td-left">${escHtml(v.bantuan_cabang || 'Surabaya')}</td>
          <td class="td-center">
            <button class="btn-logo-stiker px-2 py-1 rounded text-[11px] font-bold ${stikerDone ? 'bg-primary text-white' : 'bg-surface-raised text-ink-secondary'}"
              data-id="${v.penjualan_detail_performa_id}" data-current="${escHtml(v.foto_purchase_logo_selesai || '')}">Stiker</button>
          </td>
          <td class="td-center">
            <button class="btn-logo-resin px-2 py-1 rounded text-[11px] font-bold ${resinDone ? 'bg-primary text-white' : 'bg-surface-raised text-ink-secondary'}"
              data-id="${v.penjualan_detail_performa_id}" data-current="${escHtml(v.foto_resin_selesai || '')}">Resin</button>
          </td>
        </tr>
      `;
        }).join(''));

        jQuery('#tombol_paginasi_logo').html(
            totalPages <= 1 ? '' : `
        <div class="flex items-center justify-between gap-2">
          <button class="pag-btn px-3 py-1.5 text-sm font-bold rounded border border-ink-faint ${state.currentPage <= 1 ? 'opacity-30 pointer-events-none' : ''}" data-page="${state.currentPage - 1}">‹ Prev</button>
          <span class="text-sm font-semibold text-ink-secondary">${state.currentPage} / ${totalPages}</span>
          <button class="pag-btn px-3 py-1.5 text-sm font-bold rounded border border-ink-faint ${state.currentPage >= totalPages ? 'opacity-30 pointer-events-none' : ''}" data-page="${state.currentPage + 1}">Next ›</button>
        </div>
      `
        );
    }

    // ── Popup foto (Stiker / Resin) ───────────────────────────
    function openPhotoPopup(type, id, currentUrl) {
        photo.type = type; photo.id = id; photo.dataUrl = null;
        jQuery('#logo_photo_popup_title').text(type === 'stiker' ? 'Logo Stiker' : 'Logo Resin');
        jQuery('#logo_photo_input').val('');
        jQuery('#logo_photo_new_preview_wrap').addClass('hidden');
        jQuery('#logo_photo_zone').removeClass('hidden');

        if (currentUrl) {
            jQuery('#logo_photo_current').attr('src', currentUrl);
            jQuery('#logo_photo_current_wrap').removeClass('hidden');
        } else {
            jQuery('#logo_photo_current_wrap').addClass('hidden');
        }
        app.popup.open('#popup-logo-photo');
    }

    function onPhotoSelected(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            // Backend (PurchasingController@updateFileFotoPurchasing /
            // updateFileResinPurchasing) masih pola lama Cordova: baca
            // field sbg STRING data-URI base64 lalu preg_replace manual
            // (bukan $request->file(...) multipart). Kalau dikirim sbg
            // File/Blob asli, $request->file_foto_purchase jadi objek
            // UploadedFile dan preg_match() di backend fatal error (500).
            // Jadi simpan hasil FileReader (data URL) di sini dan kirim
            // string-nya apa adanya di savePhoto(), BUKAN photo file-nya.
            photo.dataUrl = e.target.result;
            jQuery('#logo_photo_new_preview').attr('src', photo.dataUrl);
            jQuery('#logo_photo_new_preview_wrap').removeClass('hidden');
            jQuery('#logo_photo_zone').addClass('hidden');
        };
        reader.readAsDataURL(file);
    }

    function savePhoto() {
        if (!photo.dataUrl) { app.dialog.alert('Harap isi foto'); return; }

        const isStiker = photo.type === 'stiker';
        const fd = new FormData();
        // String, bukan File -- lihat catatan di onPhotoSelected().
        fd.append(isStiker ? 'file_foto_purchase' : 'file_foto_resin', photo.dataUrl);
        fd.append(
            isStiker ? 'penjualan_detail_performa_id_foto_purchasing_logo' : 'penjualan_detail_performa_id_foto_purchasing_resin',
            photo.id
        );

        app.dialog.preloader('Mengunggah foto...');
        jQuery.ajax({
            type: 'POST',
            url: APP_CONFIG.API_BASE_URL + (isStiker ? '/update-file-foto-purchasing' : '/update-file-resin-purchasing'),
            dataType: 'JSON', data: fd, contentType: false, processData: false,
            success(data) {
                app.dialog.close();
                app.popup.close('#popup-logo-photo');
                if (data.status === 'done') { app.dialog.alert('Berhasil update foto ' + (isStiker ? 'stiker' : 'resin')); fetchList(); }
                else app.dialog.alert('Gagal update foto ' + (isStiker ? 'stiker' : 'resin'));
            },
            error() { app.dialog.close(); app.dialog.alert('Terjadi kesalahan saat upload'); },
        });
    }

    fetchList();

    return () => { };
}