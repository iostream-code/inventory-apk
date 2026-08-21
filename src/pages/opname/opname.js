import tpl from './opname.html?raw';
import { BASE_API_INVENTORY, numberFormat, formatDateShort as formatTglShort } from '../../lib/config.js';
import { showAuthedShell } from '../../lib/shell.js';

function escHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

function summaryCard(num, label, color) {
    return `<div class="summary-card">
    <div class="text-xl font-extrabold" style="color:${color};">${num}</div>
    <div class="text-[10px] font-bold text-ink-secondary tracking-wide">${label}</div>
  </div>`;
}

export function mount(container) {
    container.innerHTML = tpl;
    showAuthedShell('/opname');

    const isAdmin = () => localStorage.getItem('jabatan') === 'AdminGudang';
    const isStaff = () => localStorage.getItem('jabatan') === 'StaffGudang';
    const warehouseId = () => localStorage.getItem('warehouse_id') || 1;
    const userId = () => localStorage.getItem('user_id') || '';
    const jabatan = () => localStorage.getItem('jabatan') || '';

    const state = {
        sessions: [],
        activeSession: null,
        activeItems: [],
        isLoading: false,
        filterMonth: new Date().getMonth() + 1,
        filterYear: new Date().getFullYear(),
        searchQuery: '',
    };

    let searchTimer = null;

    // ── Month/Year selects ──────────────────────────────────
    function buildMonthOptions(selected) {
        let html = `<option value=""${selected == null ? ' selected' : ''}>Semua Bulan</option>`;
        for (let i = 1; i <= 12; i++) html += `<option value="${i}"${i === selected ? ' selected' : ''}>${MONTH_NAMES[i - 1]}</option>`;
        return html;
    }
    function buildYearOptions(selected) {
        const now = new Date().getFullYear();
        let html = `<option value=""${selected == null ? ' selected' : ''}>Semua Tahun</option>`;
        for (let y = now; y >= now - 5; y--) html += `<option value="${y}"${y === selected ? ' selected' : ''}>${y}</option>`;
        return html;
    }
    function initMonthYear() {
        jQuery('#opn_filter_month').html(buildMonthOptions(state.filterMonth));
        jQuery('#opn_filter_year').html(buildYearOptions(state.filterYear));
    }

    // ── Events ──────────────────────────────────────────────
    jQuery('#btn-opn-refresh').on('click', () => {
        state.searchQuery = '';
        state.filterMonth = new Date().getMonth() + 1;
        state.filterYear = new Date().getFullYear();
        jQuery('#opn_search').val('');
        initMonthYear();
        fetchSessions();
    });
    jQuery('#opn_filter_month, #opn_filter_year').on('change', () => {
        const m = jQuery('#opn_filter_month').val();
        const y = jQuery('#opn_filter_year').val();
        state.filterMonth = m ? parseInt(m) : null;
        state.filterYear = y ? parseInt(y) : null;
        fetchSessions();
    });
    jQuery('#opn_search').on('input', () => {
        state.searchQuery = jQuery('#opn_search').val();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(fetchSessions, 400);
    });

    jQuery('#btn-opn-new').on('click', openNewSession);
    jQuery('#opn_btn_create').on('click', createSession);

    jQuery('#opn_session_table').on('click', '.btn-tbl--detail', function (e) {
        e.preventDefault(); openDetail(jQuery(this).data('id'));
    });
    jQuery('#opn_session_table').on('click', '.btn-tbl--receive', function (e) {
        e.preventDefault(); openApprove(jQuery(this).data('id'));
    });

    jQuery('#opn_btn_close_session').on('click', openClose);
    jQuery('#opn_btn_scan').on('click', openScan);
    jQuery('#opn_btn_scan_camera').on('click', () => {
        // TODO(iterasi berikutnya): dulu pakai phonegap-plugin-barcodescanner
        // (native). Di web perlu diganti library kamera browser, mis.
        // html5-qrcode / zxing-js (butuh izin getUserMedia). Sementara input manual.
        app.dialog.alert('Scan kamera akan menyusul — sementara ketik manual kode/nama material.');
    });
    jQuery('#opn_btn_search').on('click', manualSearch);
    jQuery('#opn_scan_input').on('keydown', (e) => { if (e.key === 'Enter') manualSearch(); });
    jQuery('#opn_btn_scan_cancel').on('click', () => {
        jQuery('#opn_scan_result').addClass('hidden');
        jQuery('#opn_scan_input').val('').focus();
    });
    jQuery('#opn_btn_scan_save').on('click', () => doScanSave(false));
    jQuery('#opn_btn_scan_save_next').on('click', () => doScanSave(true));

    jQuery('#opn_btn_submit_close').on('click', submitClose);
    jQuery('#opn_approve_btn_submit').on('click', submitApprove);

    // ── Data loading ────────────────────────────────────────
    function fetchSessions() {
        if (state.isLoading) return;
        state.isLoading = true;
        jQuery('#opn_session_table').html('<tr><td colspan="4" class="tbl-empty">Memuat data...</td></tr>');

        const payload = { warehouse_id: warehouseId(), user_id: userId(), user_position: jabatan() };
        if (state.filterMonth) payload.filter_month = state.filterMonth;
        if (state.filterYear) payload.filter_year = state.filterYear;
        if (state.searchQuery) payload.search = state.searchQuery;

        jQuery.ajax({
            type: 'POST', url: BASE_API_INVENTORY + '/opname/get-sessions', dataType: 'JSON', data: payload,
            success(res) {
                state.isLoading = false;
                if (res.status === 1) {
                    state.sessions = res.data.sessions || [];
                    state.activeSession = res.data.active_session || null;
                    state.activeItems = res.data.active_items || [];
                    renderSessions();
                    renderActive();
                } else {
                    app.dialog.alert('Gagal memuat data: ' + (res.message || ''));
                }
            },
            error() { state.isLoading = false; app.dialog.alert('Terjadi kesalahan saat memuat data opname'); },
        });
    }

    function renderSessions() {
        const items = state.sessions;
        jQuery('#opn_session_count').text(items.length);
        if (!items.length) {
            jQuery('#opn_session_table').html(`<tr><td colspan="4" class="tbl-empty">${state.searchQuery ? 'Tidak ada sesi yang cocok' : 'Belum ada sesi opname'}</td></tr>`);
            return;
        }
        const rows = items.map((s, i) => {
            const opsiBtn = s.status === 'submitted' && isAdmin()
                ? `<a href="#" class="btn-tbl--receive" data-id="${s.id}">APPROVE</a>`
                : `<a href="#" class="btn-tbl--detail" data-id="${s.id}">Detail</a>`;
            return `
        <tr class="${i % 2 !== 0 ? 'bg-surface-raised/50' : ''}">
          <td class="td-center font-semibold">${i + 1}</td>
          <td class="td-center font-semibold whitespace-nowrap">${formatTglShort(s.opname_date)}</td>
          <td class="td-left font-semibold">${escHtml(s.conducted_by_name || '-')}</td>
          <td class="td-center whitespace-nowrap">${opsiBtn}</td>
        </tr>
      `;
        }).join('');
        jQuery('#opn_session_table').html(rows);
    }

    function renderActive() {
        if (!state.activeSession) {
            app.popup.close('#popup-opname-active');
            jQuery('#opn_session_header, #opn_session_list').removeClass('hidden');
            return;
        }

        const s = state.activeSession;
        const items = state.activeItems;
        const staff = isStaff();

        jQuery('#opn_active_modal_title').text(s.opname_date + ' — ' + (s.notes || 'Sesi Opname'));
        jQuery('#opn_active_modal_count').text(items.length + ' material di-scan');

        let countDiff = 0;
        items.forEach((it) => { if ((it.qty_actual || 0) - (it.qty_system || 0) !== 0) countDiff++; });
        const countOk = items.length - countDiff;

        jQuery('#opn_active_modal_summary').html(
            staff
                ? summaryCard(items.length, 'DI SCAN', 'var(--color-info)')
                : summaryCard(items.length, 'DI SCAN', 'var(--color-info)') + summaryCard(countDiff, 'SELISIH', 'var(--color-primary-light)') + summaryCard(countOk, 'SESUAI', 'var(--color-success)')
        ).toggleClass('grid-cols-3', !staff).toggleClass('grid-cols-1', staff);

        if (!items.length) {
            jQuery('#opn_active_modal_items').html(`<tr><td colspan="${staff ? 3 : 5}" class="tbl-empty">Belum ada material di-scan</td></tr>`);
        } else {
            jQuery('#opn_active_modal_items').html(items.map((it, i) => {
                const diff = (it.qty_actual || 0) - (it.qty_system || 0);
                const diffColor = diff > 0 ? 'var(--color-success)' : diff < 0 ? 'var(--color-danger)' : 'var(--text-muted)';
                const diffText = diff > 0 ? '+' + numberFormat(diff, 0, ',', '.') : numberFormat(diff, 0, ',', '.');
                return `
          <tr class="${i % 2 !== 0 ? 'bg-surface-raised/50' : ''}">
            <td class="td-center font-semibold">${i + 1}</td>
            <td class="td-left font-semibold">${escHtml(it.material_name)} <span class="text-[11px] text-ink-muted font-semibold">| ${escHtml((it.unit || '').toUpperCase())}</span></td>
            ${staff ? '' : `<td class="td-center text-ink-secondary">${numberFormat(it.qty_system, 0, ',', '.')}</td>`}
            <td class="td-center font-bold" style="color:var(--color-info);">${numberFormat(it.qty_actual, 0, ',', '.')}</td>
            ${staff ? '' : `<td class="td-center font-bold" style="color:${diffColor};">${diffText}</td>`}
          </tr>
        `;
            }).join(''));
        }
        jQuery('.opn-th-sistem, .opn-th-selisih').toggle(!staff);

        jQuery('#opn_session_header, #opn_session_list').addClass('hidden');
        app.popup.open('#popup-opname-active');
    }

    // ── Sesi baru ────────────────────────────────────────────
    function openNewSession() {
        if (state.activeSession) { app.dialog.alert('Masih ada sesi aktif. Tutup sesi terlebih dahulu.'); return; }
        jQuery('#opn_new_date').val(new Date().toISOString().split('T')[0]);
        jQuery('#opn_new_notes').val('');
        app.popup.open('#popup-opname-new');
    }

    function createSession() {
        const date = jQuery('#opn_new_date').val();
        const notes = jQuery('#opn_new_notes').val().trim();
        if (!date) { app.dialog.alert('Tanggal wajib diisi'); return; }

        jQuery.ajax({
            type: 'POST', url: BASE_API_INVENTORY + '/opname/create-session', dataType: 'JSON',
            data: { warehouse_id: warehouseId(), opname_date: date, notes, user_id: userId(), user_position: jabatan() },
            success(res) {
                if (res.status === 1) {
                    app.popup.close('#popup-opname-new');
                    app.dialog.alert('Sesi opname berhasil dibuat');
                    fetchSessions();
                } else {
                    app.dialog.alert('Gagal: ' + (res.message || ''));
                }
            },
            error() { app.dialog.alert('Terjadi kesalahan'); },
        });
    }

    // ── Scan material ───────────────────────────────────────
    function openScan() {
        jQuery('#opn_scan_input').val('');
        jQuery('#opn_scan_result').addClass('hidden');
        jQuery('#opn_scan_mat_id').val('');
        app.popup.open('#popup-opname-scan');
    }

    function manualSearch() {
        const query = jQuery('#opn_scan_input').val().trim();
        if (!query) { app.dialog.alert('Masukkan kode / nama material'); return; }

        jQuery.ajax({
            type: 'POST', url: BASE_API_INVENTORY + '/opname/lookup-material', dataType: 'JSON',
            data: { query, warehouse_id: warehouseId(), user_position: jabatan() },
            success(res) {
                if (res.status === 1 && res.data.material) {
                    const m = res.data.material;
                    jQuery('#opn_scan_mat_id').val(m.id);
                    jQuery('#opn_scan_mat_name').text(m.name);
                    if (m.show_stock === false) {
                        jQuery('#opn_scan_stock_wrap').addClass('hidden');
                    } else {
                        jQuery('#opn_scan_stock_wrap').removeClass('hidden');
                        jQuery('#opn_scan_mat_stock').text(numberFormat(m.current_stock, 0, ',', '.'));
                    }
                    jQuery('#opn_scan_mat_unit').text((m.unit || '').toUpperCase());
                    jQuery('#opn_scan_qty').val('');
                    jQuery('#opn_scan_result').removeClass('hidden');
                } else {
                    app.dialog.alert('Material tidak ditemukan');
                }
            },
            error() { app.dialog.alert('Terjadi kesalahan'); },
        });
    }

    function doScanSave(continueNext) {
        const matId = jQuery('#opn_scan_mat_id').val();
        const qty = parseFloat(jQuery('#opn_scan_qty').val());
        if (!matId) { app.dialog.alert('Material belum dipilih'); return; }
        if (isNaN(qty) || qty < 0) { app.dialog.alert('Isi stok fisik dengan benar'); return; }

        jQuery.ajax({
            type: 'POST', url: BASE_API_INVENTORY + '/opname/save-scan', dataType: 'JSON',
            data: { session_id: state.activeSession.id, material_id: matId, qty_actual: qty, warehouse_id: warehouseId(), user_id: userId() },
            success(res) {
                if (res.status === 1) {
                    if (continueNext) {
                        jQuery('#opn_scan_result').addClass('hidden');
                        jQuery('#opn_scan_input').val('').focus();
                        fetchSessions();
                    } else {
                        app.popup.close('#popup-opname-scan');
                        fetchSessions();
                    }
                } else {
                    app.dialog.alert('Gagal: ' + (res.message || ''));
                }
            },
            error() { app.dialog.alert('Terjadi kesalahan'); },
        });
    }

    // ── Tutup sesi ───────────────────────────────────────────
    function openClose() {
        const items = state.activeItems;

        if (!items.length) {
            app.dialog.confirm('Tidak ada material yang di-scan. Batalkan sesi ini?', 'Batalkan Sesi', () => {
                jQuery.ajax({
                    type: 'POST', url: BASE_API_INVENTORY + '/opname/delete-session', dataType: 'JSON',
                    data: { session_id: state.activeSession.id, warehouse_id: warehouseId() },
                    success(res) {
                        if (res.status === 1) {
                            state.activeSession = null;
                            state.activeItems = [];
                            app.popup.close('#popup-opname-close');
                            app.popup.close('#popup-opname-active');
                            fetchSessions();
                        } else {
                            app.dialog.alert('Gagal: ' + (res.message || ''));
                        }
                    },
                    error() { app.dialog.alert('Terjadi kesalahan'); },
                });
            });
            return;
        }

        let countDiff = 0, countMore = 0, countLess = 0;
        items.forEach((it) => {
            const d = (it.qty_actual || 0) - (it.qty_system || 0);
            if (d > 0) countMore++; else if (d < 0) countLess++;
            if (d !== 0) countDiff++;
        });
        const staff = isStaff();

        jQuery('#opn_close_summary').html(
            staff
                ? summaryCard(items.length, 'DI SCAN', 'var(--color-info)')
                : summaryCard(items.length, 'DI SCAN', 'var(--color-info)') + summaryCard(countDiff, 'SELISIH', 'var(--color-primary-light)') +
                summaryCard(countMore, 'LEBIH', 'var(--color-success)') + summaryCard(countLess, 'KURANG', 'var(--color-danger)')
        ).toggleClass('grid-cols-4', !staff).toggleClass('grid-cols-1', staff);

        jQuery('#opn_close_items').html(items.map((it, i) => {
            const diff = (it.qty_actual || 0) - (it.qty_system || 0);
            const fisikColor = diff !== 0 ? 'var(--color-primary-light)' : 'var(--text-primary)';
            return `
        <tr class="${i % 2 !== 0 ? 'bg-surface-raised/50' : ''}">
          <td class="td-center font-semibold">${i + 1}</td>
          <td class="td-left font-semibold">${escHtml(it.material_name)} <span class="text-[11px] text-ink-muted font-semibold">| ${escHtml((it.unit || '').toUpperCase())}</span></td>
          ${staff ? '' : `<td class="td-center text-ink-secondary">${numberFormat(it.qty_system, 0, ',', '.')}</td>`}
          <td class="td-center font-bold" style="color:${fisikColor};">${numberFormat(it.qty_actual, 0, ',', '.')}</td>
        </tr>
      `;
        }).join(''));

        jQuery('#opn_close_warning').html(
            isAdmin()
                ? '<div class="text-xs text-danger leading-relaxed">Stok akan <b>langsung diupdate</b> di sistem setelah disimpan.</div>'
                : '<div class="text-xs" style="color:var(--color-primary-light);">Stok <b>belum berubah</b> hingga diapprove oleh Admin Gudang.</div>'
        );

        app.popup.open('#popup-opname-close');
    }

    function submitClose() {
        const admin = isAdmin();
        const msg = admin ? 'Simpan dan langsung update stok di sistem? (Tidak perlu approval)' : 'Tutup sesi dan kirim ke Admin Gudang untuk approval?';
        app.dialog.confirm(msg, admin ? 'Konfirmasi Update Stok' : 'Konfirmasi', () => {
            jQuery.ajax({
                type: 'POST', url: BASE_API_INVENTORY + '/opname/submit-session', dataType: 'JSON',
                data: { session_id: state.activeSession.id, warehouse_id: warehouseId(), user_id: userId(), user_position: jabatan() },
                success(res) {
                    if (res.status === 1) {
                        app.popup.close('#popup-opname-close');
                        app.popup.close('#popup-opname-active');
                        app.dialog.alert(res.auto_approved ? 'Opname langsung diapprove. Stok telah diupdate.' : 'Sesi berhasil dikirim untuk approval Admin Gudang.');
                        fetchSessions();
                    } else {
                        app.dialog.alert('Gagal: ' + (res.message || ''));
                    }
                },
                error() { app.dialog.alert('Terjadi kesalahan'); },
            });
        });
    }

    // ── Approve / Detail (satu popup dipakai bersama) ───────
    function renderApproveOrDetail(session, items, { readOnly }) {
        jQuery('#opn_approve_popup_title').text(readOnly ? 'Detail Opname' : 'Approve');
        jQuery('#opn_approve_btn_submit').toggleClass('hidden', readOnly);

        jQuery('#opn_approve_by').text(session.conducted_by_name || '-');
        jQuery('#opn_approve_date').text(formatTglShort(session.opname_date));
        if (session.notes) jQuery('#opn_approve_notes').text(session.notes).removeClass('hidden');
        else jQuery('#opn_approve_notes').addClass('hidden');

        let countOk = 0, countMore = 0, countLess = 0;
        items.forEach((it) => {
            const d = (it.qty_actual || 0) - (it.qty_system || 0);
            if (d > 0) countMore++; else if (d < 0) countLess++; else countOk++;
        });
        jQuery('#opn_approve_summary').html(
            summaryCard(items.length, 'DI SCAN', 'var(--color-info)') +
            summaryCard(countOk, 'SESUAI', 'var(--color-success)') +
            summaryCard(countMore, 'LEBIH', 'var(--color-success)') +
            summaryCard(countLess, 'KURANG', 'var(--color-danger)')
        );

        jQuery('#opn_approve_items').html(items.map((it, i) => {
            const diff = (it.qty_actual || 0) - (it.qty_system || 0);
            const fisikColor = diff > 0 ? 'var(--color-success)' : diff < 0 ? 'var(--color-danger)' : 'var(--text-primary)';
            return `
        <tr class="${i % 2 !== 0 ? 'bg-surface-raised/50' : ''}">
          <td class="td-center font-semibold">${i + 1}</td>
          <td class="td-left font-semibold">${escHtml(it.material_name)} <span class="text-[11px] text-ink-muted font-semibold">| ${escHtml((it.unit || '').toUpperCase())}</span></td>
          <td class="td-center text-ink-secondary">${numberFormat(it.qty_system, 0, ',', '.')}</td>
          <td class="td-center font-bold" style="color:${fisikColor};">${numberFormat(it.qty_actual, 0, ',', '.')}</td>
        </tr>
      `;
        }).join(''));
    }

    function openApprove(sessionId) {
        app.dialog.preloader('Memuat data...');
        jQuery.ajax({
            type: 'POST', url: BASE_API_INVENTORY + '/opname/get-session-detail', dataType: 'JSON',
            data: { session_id: sessionId, warehouse_id: warehouseId() },
            success(res) {
                app.dialog.close();
                if (res.status === 1) {
                    renderApproveOrDetail(res.data.session, res.data.items, { readOnly: false });
                    jQuery('#opn_approve_items').data('session-id', sessionId);
                    app.popup.open('#popup-opname-approve');
                } else {
                    app.dialog.alert('Gagal memuat: ' + (res.message || ''));
                }
            },
            error() { app.dialog.close(); app.dialog.alert('Terjadi kesalahan'); },
        });
    }

    function openDetail(sessionId) {
        app.dialog.preloader('Memuat data...');
        jQuery.ajax({
            type: 'POST', url: BASE_API_INVENTORY + '/opname/get-session-detail', dataType: 'JSON',
            data: { session_id: sessionId, warehouse_id: warehouseId() },
            success(res) {
                app.dialog.close();
                if (res.status === 1) {
                    renderApproveOrDetail(res.data.session, res.data.items, { readOnly: true });
                    app.popup.open('#popup-opname-approve');
                }
            },
            error() { app.dialog.close(); app.dialog.alert('Terjadi kesalahan'); },
        });
    }

    function submitApprove() {
        const sessionId = jQuery('#opn_approve_items').data('session-id');
        app.dialog.confirm('Approve opname ini? Stok akan diupdate sesuai hasil fisik.', 'Konfirmasi', () => {
            jQuery.ajax({
                type: 'POST', url: BASE_API_INVENTORY + '/opname/approve-session', dataType: 'JSON',
                data: { session_id: sessionId, warehouse_id: warehouseId(), user_id: userId(), user_position: jabatan() },
                success(res) {
                    if (res.status === 1) {
                        app.popup.close('#popup-opname-approve');
                        app.dialog.alert('Opname diapprove. Stok telah diupdate.');
                        fetchSessions();
                    } else {
                        app.dialog.alert('Gagal: ' + (res.message || ''));
                    }
                },
                error() { app.dialog.alert('Terjadi kesalahan'); },
            });
        });
    }

    initMonthYear();
    fetchSessions();

    return () => { };
}