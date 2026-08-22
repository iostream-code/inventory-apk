import tpl from './stock-out.html?raw';
import { APP_CONFIG } from '../../lib/config.js';
import { numberFormat, formatDateShort as formatTglShort } from '../../lib/format.js';
import { showAuthedShell } from '../../lib/shell.js';

function escHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
const STATUS_CFG = {
    PENDING: { label: 'Belum Dikeluarkan', cls: 'mat-status-empty' },
    PARTIAL: { label: 'Sebagian', cls: 'mat-status-low' },
    ISSUED: { label: 'Selesai', cls: 'mat-status-ok' },
    CLOSED: { label: 'Selesai', cls: 'mat-status-ok' },
};

export function mount(container) {
    container.innerHTML = tpl;
    showAuthedShell('/stock-out');

    const warehouseId = () => localStorage.getItem('warehouse_id') || 1;
    const userId = () => localStorage.getItem('user_id') || '0';

    const state = {
        reqList: [],
        filterStatus: 'all',
        filterMonth: new Date().getMonth() + 1,
        filterYear: new Date().getFullYear(),
        searchQuery: '',
        isLoading: false,
    };
    const out = { reqId: null, photoFile: null };
    let searchTimer = null;

    function buildMonthOptions(selected) {
        let html = `<option value="">Semua Bulan</option>`;
        for (let i = 1; i <= 12; i++) html += `<option value="${i}"${i === selected ? ' selected' : ''}>${MONTH_NAMES[i - 1]}</option>`;
        return html;
    }
    function buildYearOptions(selected) {
        const now = new Date().getFullYear();
        let html = `<option value="">Semua Tahun</option>`;
        for (let y = now; y >= now - 5; y--) html += `<option value="${y}"${y === selected ? ' selected' : ''}>${y}</option>`;
        return html;
    }
    function initMonthYear() {
        jQuery('#so_filter_month').html(buildMonthOptions(state.filterMonth));
        jQuery('#so_filter_year').html(buildYearOptions(state.filterYear));
    }

    // ── Events ──────────────────────────────────────────────
    jQuery('#btn-so-refresh').on('click', () => {
        state.filterStatus = 'all'; state.searchQuery = '';
        state.filterMonth = new Date().getMonth() + 1; state.filterYear = new Date().getFullYear();
        jQuery('#so_filter_status').val('all'); jQuery('#so_search').val('');
        initMonthYear();
        fetchActive();
    });
    jQuery('#so_filter_status').on('change', () => { state.filterStatus = jQuery('#so_filter_status').val(); fetchActive(); });
    jQuery('#so_filter_month, #so_filter_year').on('change', () => {
        const m = jQuery('#so_filter_month').val(), y = jQuery('#so_filter_year').val();
        state.filterMonth = m ? parseInt(m) : null;
        state.filterYear = y ? parseInt(y) : null;
        fetchActive();
    });
    jQuery('#so_search').on('input', () => {
        state.searchQuery = jQuery('#so_search').val();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(fetchActive, 400);
    });

    jQuery('#so_req_table').on('click', '.btn-tbl--out', function (e) { e.preventDefault(); openOut(jQuery(this).data('id')); });
    jQuery('#so_req_table').on('click', '.btn-tbl--detail', function (e) { e.preventDefault(); openDetail(jQuery(this).data('id')); });
    jQuery('#so_det_btn_out').on('click', () => {
        app.popup.close('#popup-stockout-detail');
        setTimeout(() => openOut(state._detailReqId), 100);
    });

    jQuery('#so_out_photo_input').on('change', function () { onPhotoSelected(this); });
    jQuery('#so_out_photo_clear').on('click', clearPhoto);
    jQuery('#so_out_btn_submit').on('click', submitOut);

    // ── Data loading ────────────────────────────────────────
    function fetchActive() {
        if (state.isLoading) return;
        state.isLoading = true;
        jQuery('#so_req_table').html('<tr><td colspan="5" class="tbl-empty">Memuat data...</td></tr>');

        const payload = { warehouse_id: warehouseId() };
        if (state.filterMonth) payload.filter_month = state.filterMonth;
        if (state.filterYear) payload.filter_year = state.filterYear;
        if (state.filterStatus !== 'all') payload.status_filter = state.filterStatus;
        if (state.searchQuery) payload.search = state.searchQuery;

        jQuery.ajax({
            type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/stock-out/get-stockout-active', dataType: 'JSON', data: payload,
            success(res) {
                state.isLoading = false;
                if (res.status === 1) { state.reqList = res.data.req_list || []; renderTable(); }
                else app.dialog.alert('Gagal memuat data: ' + (res.message || ''));
            },
            error() { state.isLoading = false; app.dialog.alert('Terjadi kesalahan saat memuat data request'); },
        });
    }

    function renderTable() {
        const items = state.reqList;
        jQuery('#so_active_count').text(items.length);
        if (!items.length) {
            const msg = (state.filterStatus !== 'all' || state.searchQuery) ? 'Tidak ada request yang cocok' : 'Belum ada request aktif';
            jQuery('#so_req_table').html(`<tr><td colspan="5" class="tbl-empty">${msg}</td></tr>`);
            return;
        }
        jQuery('#so_req_table').html(items.map((r, i) => {
            const cfg = STATUS_CFG[r.status] || { label: r.status, cls: '' };
            return `
        <tr class="${i % 2 !== 0 ? 'bg-surface-raised/50' : ''}">
          <td class="td-center font-semibold">${i + 1}</td>
          <td class="td-left"><div class="text-primary-brand font-bold">${escHtml(r.req_number)}</div></td>
          <td class="td-center font-semibold">${formatTglShort(r.req_date)}</td>
          <td class="td-center"><span class="mat-badge ${cfg.cls}">${cfg.label}</span></td>
          <td class="td-center whitespace-nowrap">
            <a href="#" class="btn-tbl--out" data-id="${r.id}">Keluar</a>
            <a href="#" class="btn-tbl--detail" data-id="${r.id}">Detail</a>
          </td>
        </tr>
      `;
        }).join(''));
    }

    // ── Keluarkan barang ─────────────────────────────────────
    function openOut(reqId) {
        out.reqId = reqId;
        clearPhoto();
        jQuery('#so_out_items').html('<tr><td colspan="4" class="tbl-empty">Memuat data...</td></tr>');
        app.popup.open('#popup-stockout-out');

        jQuery.ajax({
            type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/stock-out/get-stockout-req-items', dataType: 'JSON',
            data: { req_id: reqId, warehouse_id: warehouseId() },
            success(res) {
                if (res.status === 1) {
                    jQuery('#so_out_req_number').text(res.data.request.req_number || '-');
                    jQuery('#so_out_req_date').text(formatTglShort(res.data.request.req_date));
                    renderOutItems(res.data.items || []);
                } else {
                    app.dialog.alert('Gagal memuat data');
                    app.popup.close('#popup-stockout-out');
                }
            },
            error() { app.dialog.alert('Terjadi kesalahan'); app.popup.close('#popup-stockout-out'); },
        });
    }

    function renderOutItems(items) {
        if (!items.length) { jQuery('#so_out_items').html('<tr><td colspan="4" class="tbl-empty">Tidak ada item</td></tr>'); return; }
        jQuery('#so_out_items').html(items.map((item, i) => {
            const unit = (item.unit || '').toUpperCase();
            const remaining = item.qty_remaining || 0;
            const stok = item.current_stock || 0;
            const canIssue = remaining > 0;
            const isLow = stok < remaining;
            const stokColor = stok <= 0 || isLow ? 'var(--color-danger)' : 'var(--color-success)';

            let qtyCell;
            if (!canIssue) qtyCell = `<span class="font-bold text-ink-faint">0</span>`;
            else if (stok <= 0) qtyCell = `<span class="font-bold text-danger">0</span>`;
            else {
                const defaultQty = Math.min(remaining, stok);
                qtyCell = `<input type="number" class="so-input-qty mat-input h-8 text-center ${isLow ? 'border-danger' : ''}" data-idx="${i}" min="0" max="${stok}" value="${defaultQty}">`;
            }

            return `
        <tr data-reqitem-id="${item.req_item_id}" data-material-id="${item.material_id}" class="${i % 2 !== 0 ? 'bg-surface-raised/50' : ''}">
          <td class="td-left font-semibold">${escHtml(item.material_name)} <span class="text-[11px] text-ink-muted font-semibold">| ${unit}</span></td>
          <td class="td-right font-bold" style="color:var(--color-primary-light);">${numberFormat(remaining, 0, ',', '.')}</td>
          <td class="td-right font-bold" style="color:${stokColor};">${numberFormat(stok, 0, ',', '.')}</td>
          <td class="td-center">${qtyCell}</td>
        </tr>
      `;
        }).join(''));
    }

    function onPhotoSelected(input) {
        if (!input.files || !input.files[0]) return;
        out.photoFile = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            jQuery('#so_out_photo_preview').attr('src', e.target.result);
            jQuery('#so_out_photo_preview_wrap').removeClass('hidden');
            jQuery('#so_out_photo_zone').addClass('hidden');
        };
        reader.readAsDataURL(out.photoFile);
    }
    function clearPhoto() {
        out.photoFile = null;
        jQuery('#so_out_photo_input').val('');
        jQuery('#so_out_photo_preview').attr('src', '');
        jQuery('#so_out_photo_preview_wrap').addClass('hidden');
        jQuery('#so_out_photo_zone').removeClass('hidden');
    }

    function submitOut() {
        const rows = [];
        let valid = false;
        jQuery('#so_out_items tr[data-reqitem-id]').each(function () {
            const $tr = jQuery(this);
            const input = $tr.find('.so-input-qty');
            const qty = input.length ? (parseFloat(input.val()) || 0) : 0;
            if (qty > 0) valid = true;
            rows.push({ req_item_id: $tr.data('reqitem-id'), material_id: $tr.data('material-id'), qty_out: qty });
        });
        if (!valid) { app.dialog.alert('Isi minimal 1 qty keluar'); return; }
        if (!out.photoFile) { app.dialog.alert('Foto bukti wajib dilampirkan.'); return; }

        app.dialog.confirm('Keluarkan material dari gudang?', 'Konfirmasi', () => {
            jQuery('#so_out_btn_submit').css('opacity', '.5').prop('disabled', true);
            const fd = new FormData();
            fd.append('req_id', out.reqId);
            fd.append('warehouse_id', warehouseId());
            fd.append('user_id', userId());
            fd.append('items', JSON.stringify(rows));
            fd.append('photo', out.photoFile);

            jQuery.ajax({
                type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/stock-out/submit-stockout', dataType: 'JSON',
                data: fd, processData: false, contentType: false,
                success(res) {
                    jQuery('#so_out_btn_submit').css('opacity', '1').prop('disabled', false);
                    if (res.status === 1) {
                        app.popup.close('#popup-stockout-out');
                        app.dialog.alert('Pengeluaran berhasil disimpan');
                        fetchActive();
                    } else {
                        app.dialog.alert('Gagal: ' + (res.message || ''));
                    }
                },
                error() { jQuery('#so_out_btn_submit').css('opacity', '1').prop('disabled', false); app.dialog.alert('Terjadi kesalahan saat menyimpan'); },
            });
        });
    }

    // ── Detail (read-only) ───────────────────────────────────
    function openDetail(reqId) {
        state._detailReqId = reqId;
        jQuery('#so_det_items').html('<tr><td colspan="4" class="tbl-empty">Memuat data...</td></tr>');
        app.popup.open('#popup-stockout-detail');

        jQuery.ajax({
            type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/stock-out/get-stockout-req-detail', dataType: 'JSON',
            data: { req_id: reqId, warehouse_id: warehouseId() },
            success(res) {
                if (res.status === 1) {
                    jQuery('#so_det_req_number').text(res.data.request.req_number || '-');
                    jQuery('#so_det_req_date').text(formatTglShort(res.data.request.req_date));
                    const pct = res.data.request.progress_pct || 0;
                    jQuery('#so_det_progress_pct').text(pct + '%');
                    jQuery('#so_det_progress_bar').css('width', pct + '%');
                    renderDetailItems(res.data.items || []);
                    jQuery('#so_det_btn_out').toggleClass('hidden', ['ISSUED', 'CLOSED'].includes(res.data.request.status));
                } else {
                    app.dialog.alert('Gagal memuat detail');
                    app.popup.close('#popup-stockout-detail');
                }
            },
            error() { app.dialog.alert('Terjadi kesalahan'); app.popup.close('#popup-stockout-detail'); },
        });
    }

    function renderDetailItems(items) {
        if (!items.length) { jQuery('#so_det_items').html('<tr><td colspan="4" class="tbl-empty">Tidak ada item</td></tr>'); return; }
        jQuery('#so_det_items').html(items.map((item, i) => {
            const sisa = item.qty_remaining || 0;
            const qtyOut = item.qty_issued || 0;
            return `
        <tr class="${i % 2 !== 0 ? 'bg-surface-raised/50' : ''}">
          <td class="td-left font-semibold">${escHtml(item.material_name)} <span class="text-[11px] text-ink-muted font-semibold">| ${escHtml((item.unit || '').toLowerCase())}</span></td>
          <td class="td-right font-bold">${numberFormat(item.qty_requested, 0, ',', '.')}</td>
          <td class="td-right font-bold" style="color:${qtyOut > 0 ? '#059669' : '#999'};">${numberFormat(qtyOut, 0, ',', '.')}</td>
          <td class="td-right font-bold" style="color:${sisa > 0 ? '#f97316' : '#059669'};">${numberFormat(sisa, 0, ',', '.')}</td>
        </tr>
      `;
        }).join(''));
    }

    initMonthYear();
    fetchActive();

    return () => { };
}