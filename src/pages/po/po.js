import tpl from './po.html?raw';
import { APP_CONFIG } from '../../lib/config.js';
import { numberFormat, formatDateShort } from '../../lib/format.js';
import { showAuthedShell } from '../../lib/shell.js';

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

// Badge status/prioritas pakai 4 warna .mat-status-* yang sudah ada (main.css)
// -- dipetakan ulang secara semantik, bukan bikin kelas warna baru.
const STATUS_CFG = {
  DRAFT: { label: 'DRAFT', cls: 'mat-status-overstock' },
  SUBMITTED: { label: 'PENDING', cls: 'mat-status-low' },
  APPROVED: { label: 'DISETUJUI', cls: 'mat-status-overstock' },
  PARTIAL_ORDERED: { label: 'SEBAGIAN PO', cls: 'mat-status-low' },
  ORDERED: { label: 'SELESAI PO', cls: 'mat-status-ok' },
  CLOSED: { label: 'SELESAI', cls: 'mat-status-ok' },
  REJECTED: { label: 'DITOLAK', cls: 'mat-status-empty' },
  CANCELLED: { label: 'DIBATALKAN', cls: 'mat-status-empty' },
};
const PRIORITY_CFG = {
  LOW: { label: 'LOW', cls: 'mat-status-overstock' },
  NORMAL: { label: 'NORMAL', cls: 'mat-status-ok' },
  HIGH: { label: 'HIGH', cls: 'mat-status-low' },
  URGENT: { label: 'URGENT', cls: 'mat-status-empty' },
};

// BARU (rombak alur Retur/PO 2026-08-30): status level-PO (bukan PR) --
// APPROVED/DRAFT/SUBMITTED dst sudah tercermin dari STATUS_CFG (PR) di atas,
// jadi cuma perlu status2 setelah PR di-approve (PO lahir) sampai selesai.
// mat-status-overstock (biru) dipakai utk RECEIVED = "selesai" -- konsisten
// dgn produksi-apk (PO_STATUS_COLOR.RECEIVED = #60a5fa, biru juga).
const PO_STATUS_CFG = {
  READY: { label: 'PO SIAP', cls: 'mat-status-ok' },
  SENT: { label: 'PO DIKIRIM', cls: 'mat-status-low' },
  PARTIAL_RECEIVED: { label: 'PO SEBAGIAN', cls: 'mat-status-low' },
  RECEIVED: { label: 'SELESAI', cls: 'mat-status-overstock' },
};

/**
 * Tab PO -- port dari popup "Request PO"/"Daftar Request Order" di
 * inventory/www/js/home.js (F7 lama, satu-satunya versi yang PERNAH benar2
 * mengimplementasikan fitur ini -- kedua versi migrasi sebelumnya cuma taruh
 * TODO). Dipisah jadi tab tersendiri (2026-08-22, sebelumnya ikon di Home):
 * seleksi barang butuh-PO TETAP di Home (checkbox + floating bar, sudah
 * ada), handoff ke sini lewat localStorage (`po_pending_selection`) --
 * page module Home & PO instance beda, tidak bisa saling akses state
 * langsung. Popup "Buat Request PO" auto-terbuka begitu mount kalau ada
 * seleksi pending, mirip openRequestPOModal() di versi F7.
 */
export function mount(container) {
  container.innerHTML = tpl;
  showAuthedShell('/po');

  const warehouseId = () => localStorage.getItem('warehouse_id') || 1;

  const state = {
    all: [],
    filtered: [],
    searchKeyword: '',
    filterMonth: new Date().getMonth() + 1,
    filterYear: new Date().getFullYear(),
    isLoading: false,
  };
  // draftItems: Map material_id -> { material_id, name, unit_code, current_stock, butuh_po, qty }
  let draftItems = {};
  let reqSearchTimer = null;

  // ── Month/Year filter ────────────────────────────────────
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
    jQuery('#po_filter_month').html(buildMonthOptions(state.filterMonth));
    jQuery('#po_filter_year').html(buildYearOptions(state.filterYear));
  }

  // ── Events ──────────────────────────────────────────────
  jQuery('#btn-po-refresh').on('click', () => {
    state.searchKeyword = '';
    state.filterMonth = new Date().getMonth() + 1;
    state.filterYear = new Date().getFullYear();
    jQuery('#po_search').val('');
    initMonthYear();
    fetchList();
  });
  jQuery('#po_search').on('input', () => {
    state.searchKeyword = jQuery('#po_search').val() || '';
    renderTable();
  });
  jQuery('#po_filter_month, #po_filter_year').on('change', () => {
    const m = jQuery('#po_filter_month').val();
    const y = jQuery('#po_filter_year').val();
    state.filterMonth = m ? parseInt(m) : null;
    state.filterYear = y ? parseInt(y) : null;
    renderTable();
  });
  jQuery('#po_table').on('click', '.btn-tbl--pr-detail', function (e) {
    e.preventDefault();
    openDetail(jQuery(this).data('id'));
  });

  jQuery('#po_req_btn_submit').on('click', submitRequest);
  jQuery('#po_req_items').on('input', '.po-qty-input', function () {
    const id = jQuery(this).data('id');
    const qty = parseFloat(jQuery(this).val()) || 0;
    if (draftItems[id]) draftItems[id].qty = qty;
  });
  jQuery('#po_req_items').on('click', '.po-remove-btn', function () {
    const id = jQuery(this).data('id');
    delete draftItems[id];
    renderDraftItems();
  });

  // ── Tombol "+" di samping Refresh: buat Request PO baru dari nol ──
  jQuery('#btn-po-add').on('click', () => {
    draftItems = {};
    openRequestPopup();
  });
  jQuery('#po_req_search').on('input', function () {
    clearTimeout(reqSearchTimer);
    const kw = jQuery(this).val();
    reqSearchTimer = setTimeout(() => searchMaterials(kw), 250);
  });
  jQuery('#po_req_search_results').on('click', '.po-search-result-item', function () {
    const id = jQuery(this).data('id');
    if (draftItems[id]) return; // sudah ditambahkan
    draftItems[id] = {
      material_id: id,
      name: jQuery(this).data('name'),
      unit_code: jQuery(this).data('unit'),
      current_stock: jQuery(this).data('stock'),
      butuh_po: 0,
      qty: 1,
    };
    renderDraftItems();
    jQuery('#po_req_search').val('');
    hideSearchResults();
  });

  // ── Data loading: list Request PO ────────────────────────
  function fetchList() {
    if (state.isLoading) return;
    state.isLoading = true;
    jQuery('#po_table').html('<tr><td colspan="6" class="tbl-empty">Memuat data...</td></tr>');

    jQuery.ajax({
      type: 'POST',
      url: APP_CONFIG.API_BASE_URL + '/inventory/home-dashboard/list-purchase-request',
      dataType: 'JSON',
      success(res) {
        state.isLoading = false;
        if (res.status === 1) {
          state.all = res.data || [];
          renderTable();
        } else {
          jQuery('#po_table').html('<tr><td colspan="6" class="tbl-empty text-danger">Gagal memuat data</td></tr>');
        }
      },
      error() {
        state.isLoading = false;
        jQuery('#po_table').html('<tr><td colspan="6" class="tbl-empty text-danger">Terjadi kesalahan saat memuat data</td></tr>');
      },
    });
  }

  function renderTable() {
    const kw = (state.searchKeyword || '').trim().toLowerCase();
    const fm = state.filterMonth;
    const fy = state.filterYear;

    state.filtered = state.all.filter((pr) => {
      if ((fm || fy) && pr.pr_date) {
        const d = new Date(pr.pr_date);
        if (!isNaN(d.getTime())) {
          if (fm && d.getMonth() + 1 !== fm) return false;
          if (fy && d.getFullYear() !== fy) return false;
        }
      }
      if (kw) {
        const nr = (pr.pr_number || '').toLowerCase();
        const nts = (pr.notes || '').toLowerCase();
        if (nr.indexOf(kw) === -1 && nts.indexOf(kw) === -1) return false;
      }
      return true;
    });

    jQuery('#po_count').text(state.filtered.length);

    if (!state.filtered.length) {
      const msg = (kw || fm || fy) ? 'Tidak ada data cocok dengan filter' : 'Belum ada data request order';
      jQuery('#po_table').html(`<tr><td colspan="6" class="tbl-empty">${msg}</td></tr>`);
      return;
    }

    jQuery('#po_table').html(state.filtered.map((pr, i) => {
      const statusCfg = STATUS_CFG[pr.status] || { label: pr.status, cls: 'mat-status-overstock' };
      const prioCfg = PRIORITY_CFG[pr.priority] || { label: pr.priority, cls: 'mat-status-overstock' };
      const poCfg = pr.po_status ? PO_STATUS_CFG[pr.po_status] : null;
      return `
        <tr class="${i % 2 !== 0 ? 'bg-surface-raised/50' : ''}">
          <td class="td-center font-semibold">${i + 1}</td>
          <td class="td-left"><div class="text-primary-brand font-bold">${escHtml(pr.pr_number)}</div></td>
          <td class="td-center font-semibold">${formatDateShort(pr.pr_date)}</td>
          <td class="td-center"><span class="mat-badge ${prioCfg.cls}">${prioCfg.label}</span></td>
          <td class="td-center">
            <span class="mat-badge ${statusCfg.cls}">${statusCfg.label}</span>
            ${poCfg ? `<div class="mt-1"><span class="mat-badge ${poCfg.cls}">${poCfg.label}</span></div>` : ''}
          </td>
          <td class="td-center"><a href="#" class="btn-tbl--pr-detail" data-id="${pr.id}">DETAIL</a></td>
        </tr>
      `;
    }).join(''));
  }

  // ── Popup: Detail Request PO (read-only, dari cache) ─────
  function openDetail(prId) {
    const pr = state.all.find((x) => String(x.id) === String(prId));
    if (!pr) { app.dialog.alert('Data tidak ditemukan'); return; }

    const statusCfg = STATUS_CFG[pr.status] || { label: pr.status, cls: 'mat-status-overstock' };
    const prioCfg = PRIORITY_CFG[pr.priority] || { label: pr.priority, cls: 'mat-status-overstock' };

    jQuery('#po_det_number').text(pr.pr_number || '-');
    jQuery('#po_det_meta').text(`${formatDateShort(pr.pr_date)} · Diminta oleh: ${pr.requester_name || '-'}`);
    jQuery('#po_det_status_badge').attr('class', `mat-badge ${statusCfg.cls}`).text(statusCfg.label);
    jQuery('#po_det_priority_badge').attr('class', `mat-badge ${prioCfg.cls}`).text(prioCfg.label);

    // BARU: badge status PO (READY/SENT/PARTIAL_RECEIVED/RECEIVED) + jadwal
    // (deadline/estimasi), diisi User Pusat di produksi-apk. Hanya tampil
    // kalau PO-nya sudah lahir dari PR ini (po_status terisi).
    const poCfg = pr.po_status ? PO_STATUS_CFG[pr.po_status] : null;
    if (poCfg) {
      jQuery('#po_det_po_status_badge').attr('class', `mat-badge ${poCfg.cls}`).text(poCfg.label).removeClass('hidden');
    } else {
      jQuery('#po_det_po_status_badge').addClass('hidden');
    }
    if (pr.po_deadline || pr.po_expected_delivery) {
      jQuery('#po_det_deadline').text(pr.po_deadline ? formatDateShort(pr.po_deadline) : '-');
      jQuery('#po_det_expected_delivery').text(pr.po_expected_delivery ? formatDateShort(pr.po_expected_delivery) : '-');
      jQuery('#po_det_schedule_wrap').removeClass('hidden');
    } else {
      jQuery('#po_det_schedule_wrap').addClass('hidden');
    }

    if (pr.notes) {
      jQuery('#po_det_notes').text(pr.notes);
      jQuery('#po_det_notes_wrap').removeClass('hidden');
    } else {
      jQuery('#po_det_notes_wrap').addClass('hidden');
    }

    const items = pr.items || [];
    jQuery('#po_det_items').html(
      items.length
        ? items.map((it) => {
          const unit = (it.unit_code || '').toUpperCase();
          const qtyReceived = it.qty_received || 0;
          return `
            <tr>
              <td class="td-left font-semibold">${escHtml(it.material_name)}</td>
              <td class="td-center">${unit}</td>
              <td class="td-right font-bold">${numberFormat(it.qty_requested, 0, ',', '.')}</td>
              <td class="td-right font-bold">${numberFormat(it.qty_ordered, 0, ',', '.')}</td>
              <td class="td-right font-bold" style="color:${qtyReceived > 0 ? '#059669' : '#999'};">${numberFormat(qtyReceived, 0, ',', '.')}</td>
              <td class="td-right font-bold" style="color:${it.qty_remaining > 0 ? '#f97316' : '#059669'};">${numberFormat(it.qty_remaining, 0, ',', '.')}</td>
            </tr>
          `;
        }).join('')
        : '<tr><td colspan="6" class="tbl-empty">Tidak ada item</td></tr>'
    );

    app.popup.open('#popup-po-detail');
  }

  // ── Popup: Buat Request PO (dari seleksi Home) ───────────
  function loadPendingSelection() {
    let items = [];
    try {
      items = JSON.parse(localStorage.getItem('po_pending_selection') || '[]');
    } catch (e) {
      items = [];
    }
    localStorage.removeItem('po_pending_selection'); // sekali pakai, jangan muncul lagi kalau balik ke tab ini nanti
    if (!Array.isArray(items) || !items.length) return;

    draftItems = {};
    items.forEach((it) => { draftItems[it.material_id] = { ...it }; });
    openRequestPopup();
  }

  function openRequestPopup() {
    renderDraftItems();
    jQuery('#po_req_priority').val('NORMAL');
    jQuery('#po_req_notes').val('');
    jQuery('#po_req_search').val('');
    hideSearchResults();
    app.popup.open('#popup-po-request');
  }

  // ── Cari & tambah barang manual (dipicu tombol "+" di samping Refresh) ──
  function searchMaterials(keyword) {
    if (!keyword || !keyword.trim()) { hideSearchResults(); return; }
    jQuery.ajax({
      type: 'POST',
      url: APP_CONFIG.API_BASE_URL + '/inventory/material/get-materials',
      dataType: 'JSON',
      data: { warehouse_id: warehouseId(), search: keyword.trim() },
      success(res) {
        if (res.status === 1) renderSearchResults(res.data.materials || []);
        else hideSearchResults();
      },
      error() { hideSearchResults(); },
    });
  }

  function renderSearchResults(materials) {
    if (!materials.length) {
      jQuery('#po_req_search_results')
        .html('<div class="p-3 text-sm text-ink-secondary text-center">Tidak ada barang cocok</div>')
        .removeClass('hidden');
      return;
    }
    jQuery('#po_req_search_results').html(materials.map((m) => {
      const unit = (m.unit_code || '').toUpperCase();
      const already = !!draftItems[m.id];
      return `
        <div class="po-search-result-item flex items-center justify-between px-3 py-2 border-b border-ink-faint last:border-0 ${already ? 'opacity-50' : 'cursor-pointer hover:bg-surface-raised'}"
             data-id="${m.id}" data-name="${escHtml(m.name)}" data-unit="${escHtml(unit)}" data-stock="${m.current_stock || 0}">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-ink-primary truncate">${escHtml(m.name)}</div>
            <div class="text-[11px] text-ink-secondary">Stok: ${numberFormat(m.current_stock || 0, 0, ',', '.')} ${unit}</div>
          </div>
          <span class="text-primary-brand font-bold text-lg leading-none flex-shrink-0 ml-2">${already ? '&check;' : '+'}</span>
        </div>
      `;
    }).join('')).removeClass('hidden');
  }

  function hideSearchResults() {
    jQuery('#po_req_search_results').addClass('hidden').empty();
  }

  function renderDraftItems() {
    const items = Object.values(draftItems);
    jQuery('#po_req_count').text(items.length);

    if (!items.length) {
      jQuery('#po_req_items').html('<tr><td colspan="5" class="tbl-empty">Tidak ada barang dipilih</td></tr>');
      return;
    }

    jQuery('#po_req_items').html(items.map((it) => {
      const unit = (it.unit_code || '').toUpperCase();
      return `
        <tr data-material-id="${it.material_id}">
          <td class="td-left font-semibold">${escHtml(it.name)} <span class="text-[11px] text-ink-muted font-semibold">| ${unit}</span></td>
          <td class="td-right font-bold">${numberFormat(it.current_stock, 0, ',', '.')}</td>
          <td class="td-right font-bold">${numberFormat(it.butuh_po, 0, ',', '.')}</td>
          <td class="td-center"><input type="number" min="0" step="1" value="${it.qty}" class="po-qty-input mat-input h-8 text-center" data-id="${it.material_id}"></td>
          <td class="td-center"><button type="button" class="po-remove-btn text-danger font-bold text-lg leading-none" data-id="${it.material_id}" title="Hapus">&times;</button></td>
        </tr>
      `;
    }).join(''));
  }

  function submitRequest() {
    const items = Object.values(draftItems).map((it) => ({
      material_id: it.material_id,
      qty_requested: Number(it.qty) || 0,
    }));

    if (!items.length) { app.dialog.alert('Tidak ada barang dipilih'); return; }
    if (items.some((i) => !i.qty_requested || i.qty_requested <= 0)) {
      app.dialog.alert('Quantity tidak boleh 0 atau kosong. Cek kembali item yang dipilih.');
      return;
    }

    const $btn = jQuery('#po_req_btn_submit');
    $btn.prop('disabled', true).text('MEMPROSES...');

    jQuery.ajax({
      type: 'POST',
      url: APP_CONFIG.API_BASE_URL + '/inventory/home-dashboard/create-purchase-request',
      dataType: 'JSON',
      // items dikirim sbg array polos (BUKAN JSON.stringify seperti
      // submit-stockin-receive/submit-stockout) -- endpoint ini murni
      // form-urlencoded (tanpa foto/FormData), jQuery.ajax otomatis
      // serialize array/object nested jadi bracket-notation
      // (items[0][material_id]=..., dst) yang langsung kebaca PHP/Slim
      // sbg array asli, tidak perlu json_decode() manual di backend.
      data: {
        warehouse_id: warehouseId(),
        priority: jQuery('#po_req_priority').val(),
        notes: jQuery('#po_req_notes').val(),
        items,
      },
      success(res) {
        $btn.prop('disabled', false).text('SIMPAN');
        if (res.status === 1) {
          app.popup.close('#popup-po-request');
          draftItems = {};
          app.toast.create({ text: '✓ ' + (res.message || 'Request PO berhasil dibuat'), position: 'center', closeTimeout: 2200 }).open();
          fetchList();
        } else {
          app.dialog.alert('Gagal: ' + (res.message || 'Unknown error'));
        }
      },
      error(xhr) {
        $btn.prop('disabled', false).text('SIMPAN');
        const res = xhr.responseJSON;
        app.dialog.alert('Gagal membuat Request PO: ' + ((res && res.message) || 'Terjadi kesalahan'));
      },
    });
  }

  initMonthYear();
  fetchList();
  loadPendingSelection();

  return () => { };
}
