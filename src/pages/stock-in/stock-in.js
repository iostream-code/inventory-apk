import tpl from './stock-in.html?raw';
import { APP_CONFIG } from '../../lib/config.js';
import { numberFormat, formatDateShort as formatTglShort } from '../../lib/format.js';
import { showAuthedShell } from '../../lib/shell.js';

function escHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
const STATUS_CFG = {
    PENDING: { label: 'Belum Diterima', cls: 'mat-status-empty' },
    PARTIAL: { label: 'Sebagian', cls: 'mat-status-low' },
    RECEIVED: { label: 'Diterima', cls: 'mat-status-ok' },
    CLOSED: { label: 'Selesai', cls: 'mat-status-ok' },
};

export function mount(container) {
    container.innerHTML = tpl;
    showAuthedShell('/stock-in');

    const warehouseId = () => localStorage.getItem('warehouse_id') || 1;
    const userId = () => localStorage.getItem('user_id') || '0';
    const lokasiPabrik = () => localStorage.getItem('lokasi_pabrik') || '';
    const isAdmin = () => localStorage.getItem('jabatan') === 'AdminGudang';

    const state = {
        poList: [],
        filterStatus: 'all',
        filterMonth: new Date().getMonth() + 1,
        filterYear: new Date().getFullYear(),
        searchQuery: '',
        isLoading: false,
    };
    const receive = { poId: null, photoFile: null };
    // Stock In manual (2026-08-23, AdminGudang-only) -- items: [{material_id, code, name, unit, currentStock}]
    const manual = { items: [], photoFile: null };
    let searchTimer = null;
    let manualSearchTimer = null;

    // ── Month/Year ───────────────────────────────────────────
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
        jQuery('#si_filter_month').html(buildMonthOptions(state.filterMonth));
        jQuery('#si_filter_year').html(buildYearOptions(state.filterYear));
    }

    // ── Events ──────────────────────────────────────────────
    jQuery('#btn-si-refresh').on('click', () => {
        state.filterStatus = 'all'; state.searchQuery = '';
        state.filterMonth = new Date().getMonth() + 1; state.filterYear = new Date().getFullYear();
        jQuery('#si_filter_status').val('all'); jQuery('#si_search').val('');
        initMonthYear();
        fetchActive();
    });
    jQuery('#si_filter_status').on('change', () => { state.filterStatus = jQuery('#si_filter_status').val(); fetchActive(); });
    jQuery('#si_filter_month, #si_filter_year').on('change', () => {
        const m = jQuery('#si_filter_month').val(), y = jQuery('#si_filter_year').val();
        state.filterMonth = m ? parseInt(m) : null;
        state.filterYear = y ? parseInt(y) : null;
        fetchActive();
    });
    jQuery('#si_search').on('input', () => {
        state.searchQuery = jQuery('#si_search').val();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(fetchActive, 400);
    });

    jQuery('#si_po_table').on('click', '.btn-tbl--receive', function (e) { e.preventDefault(); openReceive(jQuery(this).data('id')); });
    jQuery('#si_po_table').on('click', '.btn-tbl--detail', function (e) { e.preventDefault(); openDetail(jQuery(this).data('id')); });
    jQuery('#si_det_btn_receive').on('click', () => {
        app.popup.close('#popup-stockin-detail');
        setTimeout(() => openReceive(state._detailPoId), 100);
    });

    jQuery('#si_rcv_photo_input').on('change', function () { onPhotoSelected(this); });
    jQuery('#si_rcv_photo_clear').on('click', clearPhoto);
    jQuery('#si_rcv_btn_submit').on('click', submitReceive);

    // Tombol "Stock In Manual" -- HANYA AdminGudang (Manajer/SPV), pola sama
    // gate role di opname.js (isAdmin()). Server juga menolak 403 kalau
    // bukan AdminGudang (lihat StockInController::submitStockInManual di
    // backend-migrasi) -- gate di sini murni supaya staff tidak lihat
    // tombolnya sama sekali, bukan satu-satunya penjaga.
    if (isAdmin()) jQuery('#btn-si-manual').removeClass('hidden');
    jQuery('#btn-si-manual').on('click', openManual);
    jQuery('#sim_search_input').on('input', function () {
        clearTimeout(manualSearchTimer);
        const q = jQuery(this).val().trim();
        if (!q) { jQuery('#sim_search_results').addClass('hidden').empty(); return; }
        manualSearchTimer = setTimeout(() => manualSearchMaterial(q), 400);
    });
    jQuery('#sim_items').on('click', '.sim-btn-remove', function () {
        const idx = jQuery(this).data('idx');
        manual.items.splice(idx, 1);
        renderManualItems();
    });
    jQuery('#sim_photo_input').on('change', function () { onManualPhotoSelected(this); });
    jQuery('#sim_photo_clear').on('click', clearManualPhoto);
    jQuery('#sim_btn_submit').on('click', submitManual);

    // ── Data loading ────────────────────────────────────────
    function fetchActive() {
        if (state.isLoading) return;
        if (!lokasiPabrik()) { app.dialog.alert('Lokasi pabrik tidak ditemukan. Silakan login ulang.'); return; }
        state.isLoading = true;
        jQuery('#si_po_table').html('<tr><td colspan="6" class="tbl-empty">Memuat data...</td></tr>');

        const payload = { warehouse_id: warehouseId() };
        if (state.filterMonth) payload.filter_month = state.filterMonth;
        if (state.filterYear) payload.filter_year = state.filterYear;
        if (state.filterStatus !== 'all') payload.status_filter = state.filterStatus;
        if (state.searchQuery) payload.search = state.searchQuery;

        jQuery.ajax({
            type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/stock-in/get-stockin-active', dataType: 'JSON', data: payload,
            success(res) {
                state.isLoading = false;
                if (res.status === 1) { state.poList = res.data.po_list || []; renderTable(); }
                else app.dialog.alert('Gagal memuat data: ' + (res.message || ''));
            },
            error() { state.isLoading = false; app.dialog.alert('Terjadi kesalahan saat memuat data PO'); },
        });
    }

    function renderTable() {
        const items = state.poList;
        jQuery('#si_active_count').text(items.length);
        if (!items.length) {
            const msg = (state.filterStatus !== 'all' || state.searchQuery) ? 'Tidak ada PO yang cocok' : 'Belum ada PO aktif';
            jQuery('#si_po_table').html(`<tr><td colspan="6" class="tbl-empty">${msg}</td></tr>`);
            return;
        }
        jQuery('#si_po_table').html(items.map((po, i) => {
            const cfg = STATUS_CFG[po.status] || { label: po.status, cls: '' };
            return `
        <tr class="${i % 2 !== 0 ? 'bg-surface-raised/50' : ''}">
          <td class="td-center font-semibold">${i + 1}</td>
          <td class="td-left"><div class="text-primary-brand font-bold">${escHtml(po.po_number)}</div></td>
          <td class="td-left font-semibold">${escHtml(po.supplier_name)}</td>
          <td class="td-center font-semibold">${formatTglShort(po.po_date)}</td>
          <td class="td-center"><span class="mat-badge ${cfg.cls}">${cfg.label}</span></td>
          <td class="td-center whitespace-nowrap">
            <a href="#" class="btn-tbl--receive" data-id="${po.id}">Receive</a>
            <a href="#" class="btn-tbl--detail" data-id="${po.id}">Detail</a>
          </td>
        </tr>
      `;
        }).join(''));
    }

    // ── Receive ──────────────────────────────────────────────
    function openReceive(poId) {
        receive.poId = poId;
        clearPhoto();
        jQuery('#si_rcv_external_sj').val('');
        jQuery('#si_rcv_items').html('<tr><td colspan="4" class="tbl-empty">Memuat data...</td></tr>');
        app.popup.open('#popup-stockin-receive');

        jQuery.ajax({
            type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/stock-in/get-stockin-po-items', dataType: 'JSON',
            data: { po_id: poId, lokasi_pabrik: lokasiPabrik() },
            success(res) {
                if (res.status === 1) {
                    jQuery('#si_rcv_header_title').text('RECEIVE ' + (res.data.po.po_number || ''));
                    jQuery('#si_rcv_po_date').text(formatTglShort(res.data.po.po_date));
                    jQuery('#si_rcv_supplier').text(res.data.po.supplier_name || '-');
                    renderReceiveItems(res.data.items || []);
                } else {
                    app.dialog.alert('Gagal memuat item PO');
                    app.popup.close('#popup-stockin-receive');
                }
            },
            error() { app.dialog.alert('Terjadi kesalahan'); app.popup.close('#popup-stockin-receive'); },
        });
    }

    function renderReceiveItems(items) {
        if (!items.length) { jQuery('#si_rcv_items').html('<tr><td colspan="4" class="tbl-empty">Tidak ada item</td></tr>'); return; }
        jQuery('#si_rcv_items').html(items.map((item, i) => {
            const sisa = item.qty_remaining || 0;
            const canInput = sisa > 0;
            const rcvCell = canInput
                ? `<input type="number" class="si-input-rcv mat-input h-8 text-center" data-idx="${i}" min="0" placeholder="0">`
                : `<span class="font-bold text-ink-faint">0</span>`;
            return `
        <tr data-poitem-id="${item.po_item_id}" data-material-id="${item.material_id}" class="${i % 2 !== 0 ? 'bg-surface-raised/50' : ''}">
          <td class="td-left font-semibold">${escHtml(item.material_name)} <span class="text-[11px] text-ink-muted font-semibold">| ${escHtml((item.unit || '').toUpperCase())}</span></td>
          <td class="td-right font-bold">${numberFormat(item.qty_ordered, 0, ',', '.')}</td>
          <td class="td-right font-bold" style="color:${sisa > 0 ? 'var(--color-primary-light)' : 'var(--color-success)'};">${numberFormat(sisa, 0, ',', '.')}</td>
          <td class="td-center">${rcvCell}</td>
        </tr>
      `;
        }).join(''));
    }

    function onPhotoSelected(input) {
        if (!input.files || !input.files[0]) return;
        receive.photoFile = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            jQuery('#si_rcv_photo_preview').attr('src', e.target.result);
            jQuery('#si_rcv_photo_preview_wrap').removeClass('hidden');
            jQuery('#si_rcv_photo_zone').addClass('hidden');
        };
        reader.readAsDataURL(receive.photoFile);
    }
    function clearPhoto() {
        receive.photoFile = null;
        jQuery('#si_rcv_photo_input').val('');
        jQuery('#si_rcv_photo_preview').attr('src', '');
        jQuery('#si_rcv_photo_preview_wrap').addClass('hidden');
        jQuery('#si_rcv_photo_zone').removeClass('hidden');
    }

    function submitReceive() {
        const rows = [];
        let valid = false;
        jQuery('#si_rcv_items tr[data-poitem-id]').each(function () {
            const $tr = jQuery(this);
            const qty = parseFloat($tr.find('.si-input-rcv').val()) || 0;
            if (qty > 0) valid = true;
            rows.push({ po_item_id: $tr.data('poitem-id'), material_id: $tr.data('material-id'), qty_receive: qty });
        });
        if (!valid) { app.dialog.alert('Isi minimal 1 qty receive'); return; }
        if (!receive.photoFile) { app.dialog.alert('Foto bukti wajib dilampirkan.'); return; }

        app.dialog.confirm('Simpan penerimaan barang?', 'Konfirmasi', () => {
            jQuery('#si_rcv_btn_submit').css('opacity', '.5').prop('disabled', true);
            const fd = new FormData();
            fd.append('po_id', receive.poId);
            fd.append('warehouse_id', warehouseId());
            fd.append('user_id', userId());
            fd.append('items', JSON.stringify(rows));
            const externalSj = jQuery('#si_rcv_external_sj').val().trim();
            if (externalSj) fd.append('external_sj_number', externalSj);
            fd.append('photo', receive.photoFile);

            jQuery.ajax({
                type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/stock-in/submit-stockin-receive', dataType: 'JSON',
                data: fd, processData: false, contentType: false,
                success(res) {
                    jQuery('#si_rcv_btn_submit').css('opacity', '1').prop('disabled', false);
                    if (res.status === 1) {
                        app.popup.close('#popup-stockin-receive');
                        app.dialog.alert('Penerimaan berhasil disimpan');
                        fetchActive();
                    } else {
                        app.dialog.alert('Gagal: ' + (res.message || ''));
                    }
                },
                error() { jQuery('#si_rcv_btn_submit').css('opacity', '1').prop('disabled', false); app.dialog.alert('Terjadi kesalahan saat menyimpan'); },
            });
        });
    }

    // ── Stock In Manual (2026-08-23, AdminGudang-only) ───────
    // Ad-hoc di luar PO (hadiah supplier, sisa produksi, retur customer, dll)
    // -- posting ke wh_t_stock_adjustment, BUKAN pur_t_receive_warehouse
    // (lihat StockInController::submitStockInManual di backend-migrasi).
    function openManual() {
        manual.items = [];
        manual.photoFile = null;
        jQuery('#sim_search_input').val('');
        jQuery('#sim_search_results').addClass('hidden').empty();
        jQuery('#sim_notes').val('');
        clearManualPhoto();
        renderManualItems();
        app.popup.open('#popup-stockin-manual');
    }

    // Cari material via endpoint yang SAMA dgn halaman Master Barang
    // (POST /inventory/material/get-materials, support search partial nama/
    // kode/kategori) -- BUKAN /inventory/opname/lookup-material (dipakai
    // opname.js), krn lookup-material cuma exact-match id/code/barcode,
    // tidak cocok utk "cari lalu pilih dari daftar" spt yang dibutuhkan di sini.
    function manualSearchMaterial(query) {
        jQuery.ajax({
            type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/material/get-materials', dataType: 'JSON',
            data: { warehouse_id: warehouseId(), search: query },
            success(res) {
                if (res.status === 1) renderManualSearchResults(res.data.materials || []);
            },
            error() { /* gagal diam-diam -- dropdown hasil cuma tidak muncul, bukan alert intrusif tiap ketik */ },
        });
    }

    function renderManualSearchResults(materials) {
        const $box = jQuery('#sim_search_results');
        const alreadyAdded = new Set(manual.items.map((it) => it.material_id));
        const candidates = materials.filter((m) => !alreadyAdded.has(m.id)).slice(0, 8);

        if (!candidates.length) {
            $box.html('<div class="px-3 py-2.5 text-sm text-ink-faint">Tidak ada material cocok / sudah semua ditambahkan</div>').removeClass('hidden');
            return;
        }
        $box.html(candidates.map((m) => `
      <button type="button" class="sim-result-item w-full text-left px-3 py-2 border-b border-ink-faint last:border-0 hover:bg-surface-raised"
        data-id="${m.id}" data-code="${escHtml(m.code)}" data-name="${escHtml(m.name)}" data-unit="${escHtml(m.unit_abbr || m.unit_code || '-')}" data-stock="${m.current_stock || 0}">
        <div class="text-sm font-semibold text-ink-primary">${escHtml(m.name)}</div>
        <div class="text-xs text-ink-secondary">${escHtml(m.code)} &middot; Stok: ${numberFormat(m.current_stock || 0, 0, ',', '.')} ${escHtml((m.unit_abbr || m.unit_code || '').toUpperCase())}</div>
      </button>
    `).join('')).removeClass('hidden');

        $box.find('.sim-result-item').on('click', function () {
            const $b = jQuery(this);
            manual.items.push({
                material_id: parseInt($b.data('id'), 10),
                code: $b.data('code'),
                name: $b.data('name'),
                unit: $b.data('unit'),
                currentStock: parseFloat($b.data('stock')) || 0,
                qty: '',
            });
            jQuery('#sim_search_input').val('');
            $box.addClass('hidden').empty();
            renderManualItems();
        });
    }

    function renderManualItems() {
        if (!manual.items.length) {
            jQuery('#sim_items').html('<tr><td colspan="4" class="tbl-empty">Belum ada material ditambahkan</td></tr>');
            return;
        }
        jQuery('#sim_items').html(manual.items.map((it, i) => `
      <tr data-idx="${i}">
        <td class="td-left font-semibold">${escHtml(it.name)} <span class="text-[11px] text-ink-muted font-semibold">| ${escHtml((it.unit || '').toUpperCase())}</span></td>
        <td class="td-right font-bold">${numberFormat(it.currentStock, 0, ',', '.')}</td>
        <td class="td-center"><input type="number" class="sim-input-qty mat-input h-8 text-center" data-idx="${i}" min="0" placeholder="0" value="${it.qty}"></td>
        <td class="td-center"><button type="button" class="sim-btn-remove text-danger text-lg leading-none" data-idx="${i}">&times;</button></td>
      </tr>
    `).join(''));
        jQuery('#sim_items .sim-input-qty').on('input', function () {
            const idx = jQuery(this).data('idx');
            manual.items[idx].qty = jQuery(this).val();
        });
    }

    function onManualPhotoSelected(input) {
        if (!input.files || !input.files[0]) return;
        manual.photoFile = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            jQuery('#sim_photo_preview').attr('src', e.target.result);
            jQuery('#sim_photo_preview_wrap').removeClass('hidden');
            jQuery('#sim_photo_zone').addClass('hidden');
        };
        reader.readAsDataURL(manual.photoFile);
    }
    function clearManualPhoto() {
        manual.photoFile = null;
        jQuery('#sim_photo_input').val('');
        jQuery('#sim_photo_preview').attr('src', '');
        jQuery('#sim_photo_preview_wrap').addClass('hidden');
        jQuery('#sim_photo_zone').removeClass('hidden');
    }

    function submitManual() {
        const rows = [];
        let valid = false;
        manual.items.forEach((it) => {
            const qty = parseFloat(it.qty) || 0;
            if (qty > 0) valid = true;
            rows.push({ material_id: it.material_id, qty });
        });
        if (!manual.items.length || !valid) { app.dialog.alert('Tambahkan minimal 1 material dengan qty > 0'); return; }

        app.dialog.confirm('Simpan Stock In manual ini?', 'Konfirmasi', () => {
            jQuery('#sim_btn_submit').css('opacity', '.5').prop('disabled', true);
            const fd = new FormData();
            fd.append('warehouse_id', warehouseId());
            fd.append('user_id', userId());
            fd.append('items', JSON.stringify(rows));
            const notes = jQuery('#sim_notes').val().trim();
            if (notes) fd.append('notes', notes);
            if (manual.photoFile) fd.append('photo', manual.photoFile);

            jQuery.ajax({
                type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/stock-in/submit-stockin-manual', dataType: 'JSON',
                data: fd, processData: false, contentType: false,
                success(res) {
                    jQuery('#sim_btn_submit').css('opacity', '1').prop('disabled', false);
                    if (res.status === 1) {
                        app.popup.close('#popup-stockin-manual');
                        app.dialog.alert('Stock In manual berhasil disimpan: ' + (res.data.doc_number || ''));
                    } else {
                        app.dialog.alert('Gagal: ' + (res.message || ''));
                    }
                },
                error(xhr) {
                    jQuery('#sim_btn_submit').css('opacity', '1').prop('disabled', false);
                    const msg = xhr.status === 403 ? 'Hanya AdminGudang yang boleh melakukan Stock In manual.' : 'Terjadi kesalahan saat menyimpan';
                    app.dialog.alert(msg);
                },
            });
        });
    }

    // ── Detail (read-only) ───────────────────────────────────
    function openDetail(poId) {
        state._detailPoId = poId;
        jQuery('#si_det_items').html('<tr><td colspan="5" class="tbl-empty">Memuat data...</td></tr>');
        app.popup.open('#popup-stockin-detail');

        jQuery.ajax({
            type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/stock-in/get-stockin-po-detail', dataType: 'JSON',
            data: { po_id: poId, lokasi_pabrik: lokasiPabrik() },
            success(res) {
                if (res.status === 1) {
                    jQuery('#si_det_header_po').text(res.data.po.po_number || '');
                    jQuery('#si_det_po_date').text(formatTglShort(res.data.po.po_date));
                    jQuery('#si_det_supplier').text(res.data.po.supplier_name || '-');
                    renderDetailItems(res.data.items || []);
                    jQuery('#si_det_btn_receive').toggleClass('hidden', ['RECEIVED', 'CLOSED'].includes(res.data.po.status));
                } else {
                    app.dialog.alert('Gagal memuat detail PO');
                    app.popup.close('#popup-stockin-detail');
                }
            },
            error() { app.dialog.alert('Terjadi kesalahan'); app.popup.close('#popup-stockin-detail'); },
        });
    }

    function renderDetailItems(items) {
        if (!items.length) { jQuery('#si_det_items').html('<tr><td colspan="5" class="tbl-empty">Tidak ada item</td></tr>'); return; }
        jQuery('#si_det_items').html(items.map((item, i) => {
            const sisa = item.qty_remaining || 0;
            const qtyRcv = item.qty_received || 0;
            const qtyRet = item.qty_returned || 0;
            return `
        <tr class="${i % 2 !== 0 ? 'bg-surface-raised/50' : ''}">
          <td class="td-left font-semibold">${escHtml(item.material_name)} <span class="text-[11px] text-ink-muted font-semibold">| ${escHtml((item.unit || '').toLowerCase())}</span></td>
          <td class="td-right font-bold">${numberFormat(item.qty_ordered, 0, ',', '.')}</td>
          <td class="td-right font-bold" style="color:${qtyRcv > 0 ? '#059669' : '#999'};">${numberFormat(qtyRcv, 0, ',', '.')}</td>
          <td class="td-right font-bold" style="color:${qtyRet > 0 ? '#ef4444' : '#999'};">${numberFormat(qtyRet, 0, ',', '.')}</td>
          <td class="td-right font-bold" style="color:${sisa > 0 ? '#f97316' : '#059669'};">${numberFormat(sisa, 0, ',', '.')}</td>
        </tr>
      `;
        }).join(''));
    }

    initMonthYear();
    fetchActive();

    return () => { };
}