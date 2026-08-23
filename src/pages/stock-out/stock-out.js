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
    const isAdmin = () => localStorage.getItem('jabatan') === 'AdminGudang';

    const state = {
        reqList: [],
        filterStatus: 'all',
        filterMonth: new Date().getMonth() + 1,
        filterYear: new Date().getFullYear(),
        searchQuery: '',
        isLoading: false,
    };
    const out = { reqId: null, photoFile: null };
    // Stock Out manual (2026-08-23, AdminGudang-only) -- items: [{material_id, code, name, unit, currentStock}]
    const manual = { items: [] };
    let searchTimer = null;
    let manualSearchTimer = null;

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

    // Tombol "Stock Out Manual" -- HANYA AdminGudang (Manajer/SPV), pola sama
    // stock-in.js. Server juga menolak 403 kalau bukan AdminGudang (lihat
    // StockOutController::submitStockOutManual di backend-migrasi).
    if (isAdmin()) jQuery('#btn-so-manual').removeClass('hidden');
    jQuery('#btn-so-manual').on('click', openManual);
    jQuery('#som_search_input').on('input', function () {
        clearTimeout(manualSearchTimer);
        const q = jQuery(this).val().trim();
        if (!q) { jQuery('#som_search_results').addClass('hidden').empty(); return; }
        manualSearchTimer = setTimeout(() => manualSearchMaterial(q), 400);
    });
    jQuery('#som_items').on('click', '.som-btn-remove', function () {
        const idx = jQuery(this).data('idx');
        manual.items.splice(idx, 1);
        renderManualItems();
    });
    jQuery('#som_btn_submit').on('click', submitManual);

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

    // ── Stock Out Manual (2026-08-23, AdminGudang-only) ──────
    // Ad-hoc di luar request produksi (barang rusak dibuang, sample QC,
    // hilang, disposal, dll) -- posting ke wh_t_stock_adjustment, BUKAN
    // prd_t_material_issue (lihat StockOutController::submitStockOutManual
    // di backend-migrasi). TIDAK ada foto (asimetri sengaja dari versi asli
    // Laravel, lihat docblock StockOutController.php).
    function openManual() {
        manual.items = [];
        jQuery('#som_search_input').val('');
        jQuery('#som_search_results').addClass('hidden').empty();
        jQuery('#som_reason').val('');
        jQuery('#som_notes').val('');
        renderManualItems();
        app.popup.open('#popup-stockout-manual');
    }

    // Sama pola dgn stock-in.js: reuse /inventory/material/get-materials
    // (support search partial nama/kode), BUKAN lookup-material yang
    // exact-match saja.
    function manualSearchMaterial(query) {
        jQuery.ajax({
            type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/material/get-materials', dataType: 'JSON',
            data: { warehouse_id: warehouseId(), search: query },
            success(res) {
                if (res.status === 1) renderManualSearchResults(res.data.materials || []);
            },
            error() { /* gagal diam-diam -- dropdown hasil cuma tidak muncul */ },
        });
    }

    function renderManualSearchResults(materials) {
        const $box = jQuery('#som_search_results');
        const alreadyAdded = new Set(manual.items.map((it) => it.material_id));
        const candidates = materials.filter((m) => !alreadyAdded.has(m.id)).slice(0, 8);

        if (!candidates.length) {
            $box.html('<div class="px-3 py-2.5 text-sm text-ink-faint">Tidak ada material cocok / sudah semua ditambahkan</div>').removeClass('hidden');
            return;
        }
        $box.html(candidates.map((m) => `
      <button type="button" class="som-result-item w-full text-left px-3 py-2 border-b border-ink-faint last:border-0 hover:bg-surface-raised"
        data-id="${m.id}" data-code="${escHtml(m.code)}" data-name="${escHtml(m.name)}" data-unit="${escHtml(m.unit_abbr || m.unit_code || '-')}" data-stock="${m.current_stock || 0}">
        <div class="text-sm font-semibold text-ink-primary">${escHtml(m.name)}</div>
        <div class="text-xs text-ink-secondary">${escHtml(m.code)} &middot; Stok: ${numberFormat(m.current_stock || 0, 0, ',', '.')} ${escHtml((m.unit_abbr || m.unit_code || '').toUpperCase())}</div>
      </button>
    `).join('')).removeClass('hidden');

        $box.find('.som-result-item').on('click', function () {
            const $b = jQuery(this);
            manual.items.push({
                material_id: parseInt($b.data('id'), 10),
                code: $b.data('code'),
                name: $b.data('name'),
                unit: $b.data('unit'),
                currentStock: parseFloat($b.data('stock')) || 0,
                qty: '',
            });
            jQuery('#som_search_input').val('');
            $box.addClass('hidden').empty();
            renderManualItems();
        });
    }

    function renderManualItems() {
        if (!manual.items.length) {
            jQuery('#som_items').html('<tr><td colspan="4" class="tbl-empty">Belum ada material ditambahkan</td></tr>');
            return;
        }
        jQuery('#som_items').html(manual.items.map((it, i) => {
            const stokColor = it.currentStock <= 0 ? 'var(--color-danger)' : 'var(--color-success)';
            return `
      <tr data-idx="${i}">
        <td class="td-left font-semibold">${escHtml(it.name)} <span class="text-[11px] text-ink-muted font-semibold">| ${escHtml((it.unit || '').toUpperCase())}</span></td>
        <td class="td-right font-bold" style="color:${stokColor};">${numberFormat(it.currentStock, 0, ',', '.')}</td>
        <td class="td-center"><input type="number" class="som-input-qty mat-input h-8 text-center" data-idx="${i}" min="0" max="${it.currentStock}" placeholder="0" value="${it.qty}"></td>
        <td class="td-center"><button type="button" class="som-btn-remove text-danger text-lg leading-none" data-idx="${i}">&times;</button></td>
      </tr>
    `;
        }).join(''));
        jQuery('#som_items .som-input-qty').on('input', function () {
            const idx = jQuery(this).data('idx');
            manual.items[idx].qty = jQuery(this).val();
        });
    }

    function submitManual() {
        const rows = [];
        let valid = false;
        let overStock = false;
        manual.items.forEach((it) => {
            const qty = parseFloat(it.qty) || 0;
            if (qty > 0) valid = true;
            if (qty > it.currentStock) overStock = true;
            rows.push({ material_id: it.material_id, qty });
        });
        if (!manual.items.length || !valid) { app.dialog.alert('Tambahkan minimal 1 material dengan qty > 0'); return; }
        if (overStock) { app.dialog.alert('Ada qty keluar yang melebihi stok tersedia -- periksa kembali.'); return; }

        app.dialog.confirm('Simpan Stock Out manual ini?', 'Konfirmasi', () => {
            jQuery('#som_btn_submit').css('opacity', '.5').prop('disabled', true);
            const payload = {
                warehouse_id: warehouseId(),
                user_id: userId(),
                items: JSON.stringify(rows),
            };
            const reason = jQuery('#som_reason').val().trim();
            if (reason) payload.reason = reason;
            const notes = jQuery('#som_notes').val().trim();
            if (notes) payload.notes = notes;

            jQuery.ajax({
                type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/stock-out/submit-stockout-manual', dataType: 'JSON', data: payload,
                success(res) {
                    jQuery('#som_btn_submit').css('opacity', '1').prop('disabled', false);
                    if (res.status === 1) {
                        app.popup.close('#popup-stockout-manual');
                        app.dialog.alert('Stock Out manual berhasil disimpan: ' + (res.data.doc_number || ''));
                    } else {
                        app.dialog.alert('Gagal: ' + (res.message || ''));
                    }
                },
                error(xhr) {
                    jQuery('#som_btn_submit').css('opacity', '1').prop('disabled', false);
                    const msg = xhr.status === 403 ? 'Hanya AdminGudang yang boleh melakukan Stock Out manual.' : 'Terjadi kesalahan saat menyimpan';
                    app.dialog.alert(msg);
                },
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