import tpl from './retur.html?raw';
import { APP_CONFIG } from '../../lib/config.js';
import { numberFormat, formatDateShort } from '../../lib/format.js';
import { showAuthedShell } from '../../lib/shell.js';

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// BARU (rombak alur Retur/PO 2026-08-30): Admin Inventory ajukan retur atas
// PO yang sudah (sebagian) diterima. Approve/reject-nya sendiri wewenang
// User Pusat di produksi-apk (endpoint sama, backend-production) -- tab ini
// cuma bisa mengajukan + memantau status.
const STATUS_CFG = {
  SUBMITTED: { label: 'DIAJUKAN', cls: 'mat-status-low' },
  APPROVED: { label: 'DISETUJUI', cls: 'mat-status-ok' },
  PARTIAL_REPLACED: { label: 'SEBAGIAN DIGANTI', cls: 'mat-status-low' },
  REPLACED: { label: 'SELESAI', cls: 'mat-status-overstock' },
  CLOSED: { label: 'SELESAI', cls: 'mat-status-overstock' },
  REJECTED: { label: 'DITOLAK', cls: 'mat-status-empty' },
  CANCELLED: { label: 'DIBATALKAN', cls: 'mat-status-empty' },
};

export function mount(container) {
  container.innerHTML = tpl;
  showAuthedShell('/retur');

  const warehouseId = () => localStorage.getItem('warehouse_id') || 1;

  const state = {
    all: [],
    filtered: [],
    searchKeyword: '',
    isLoading: false,
  };
  let eligiblePo = [];
  // draftItems: Map po_detail_id -> { po_detail_id, name, unit_code, qty_returnable, qty, reason }
  let draftItems = {};

  // ── Events ──────────────────────────────────────────────
  jQuery('#btn-retur-refresh').on('click', () => {
    state.searchKeyword = '';
    jQuery('#retur_search').val('');
    fetchList();
  });
  jQuery('#retur_search').on('input', () => {
    state.searchKeyword = jQuery('#retur_search').val() || '';
    renderTable();
  });
  jQuery('#retur_table').on('click', '.btn-tbl--retur-detail', function (e) {
    e.preventDefault();
    openDetail(jQuery(this).data('id'));
  });

  jQuery('#btn-retur-add').on('click', openRequestPopup);
  jQuery('#retur_req_po').on('change', function () { renderDraftItems(jQuery(this).val()); });
  jQuery('#retur_req_items').on('input', '.retur-qty-input', function () {
    const id = jQuery(this).data('id');
    const qty = parseFloat(jQuery(this).val()) || 0;
    if (draftItems[id]) draftItems[id].qty = qty;
  });
  jQuery('#retur_req_items').on('change', '.retur-reason-input', function () {
    const id = jQuery(this).data('id');
    if (draftItems[id]) draftItems[id].reason = jQuery(this).val();
  });
  jQuery('#retur_req_btn_submit').on('click', submitRequest);

  // ── Data loading: list Retur ──────────────────────────────
  function fetchList() {
    if (state.isLoading) return;
    state.isLoading = true;
    jQuery('#retur_table').html('<tr><td colspan="6" class="tbl-empty">Memuat data...</td></tr>');

    jQuery.ajax({
      type: 'POST',
      url: APP_CONFIG.API_BASE_URL + '/inventory/purchase-retur/list',
      dataType: 'JSON',
      data: { warehouse_id: warehouseId() },
      success(res) {
        state.isLoading = false;
        if (res.status === 1) {
          state.all = res.data || [];
          renderTable();
        } else {
          jQuery('#retur_table').html('<tr><td colspan="6" class="tbl-empty text-danger">Gagal memuat data</td></tr>');
        }
      },
      error() {
        state.isLoading = false;
        jQuery('#retur_table').html('<tr><td colspan="6" class="tbl-empty text-danger">Terjadi kesalahan saat memuat data</td></tr>');
      },
    });
  }

  function renderTable() {
    const kw = (state.searchKeyword || '').trim().toLowerCase();
    state.filtered = state.all.filter((r) => {
      if (!kw) return true;
      const no = (r.retur_number || '').toLowerCase();
      const po = (r.po_number || '').toLowerCase();
      return no.indexOf(kw) !== -1 || po.indexOf(kw) !== -1;
    });

    jQuery('#retur_count').text(state.filtered.length);

    if (!state.filtered.length) {
      const msg = kw ? 'Tidak ada data cocok dengan pencarian' : 'Belum ada data retur';
      jQuery('#retur_table').html(`<tr><td colspan="6" class="tbl-empty">${msg}</td></tr>`);
      return;
    }

    jQuery('#retur_table').html(state.filtered.map((r, i) => {
      const cfg = STATUS_CFG[r.status] || { label: r.status, cls: 'mat-status-overstock' };
      return `
        <tr class="${i % 2 !== 0 ? 'bg-surface-raised/50' : ''}">
          <td class="td-center font-semibold">${i + 1}</td>
          <td class="td-left"><div class="text-primary-brand font-bold">${escHtml(r.retur_number)}</div></td>
          <td class="td-center font-semibold">${formatDateShort(r.retur_date)}</td>
          <td class="td-center">${escHtml(r.po_number || '-')}</td>
          <td class="td-center"><span class="mat-badge ${cfg.cls}">${cfg.label}</span></td>
          <td class="td-center"><a href="#" class="btn-tbl--retur-detail" data-id="${r.id}">DETAIL</a></td>
        </tr>
      `;
    }).join(''));
  }

  // ── Popup: Detail Retur (read-only, dari cache) ──────────
  function openDetail(returId) {
    const r = state.all.find((x) => String(x.id) === String(returId));
    if (!r) { app.dialog.alert('Data tidak ditemukan'); return; }

    const cfg = STATUS_CFG[r.status] || { label: r.status, cls: 'mat-status-overstock' };

    jQuery('#retur_det_number').text(r.retur_number || '-');
    jQuery('#retur_det_meta').text(`${formatDateShort(r.retur_date)} · PO: ${r.po_number || '-'} · Diajukan oleh: ${r.requester_name || '-'}`);
    jQuery('#retur_det_status_badge').attr('class', `mat-badge ${cfg.cls}`).text(cfg.label);

    if (r.status === 'REJECTED' && r.rejected_reason) {
      jQuery('#retur_det_rejected_reason').text(r.rejected_reason);
      jQuery('#retur_det_rejected_wrap').removeClass('hidden');
    } else {
      jQuery('#retur_det_rejected_wrap').addClass('hidden');
    }

    if (r.notes) {
      jQuery('#retur_det_notes').text(r.notes);
      jQuery('#retur_det_notes_wrap').removeClass('hidden');
    } else {
      jQuery('#retur_det_notes_wrap').addClass('hidden');
    }

    const items = r.items || [];
    jQuery('#retur_det_items').html(
      items.length
        ? items.map((it) => {
          const unit = (it.unit_code || '').toUpperCase();
          return `
            <tr>
              <td class="td-left font-semibold">${escHtml(it.material_name)} <span class="text-[11px] text-ink-muted font-semibold">| ${unit}</span></td>
              <td class="td-right font-bold">${numberFormat(it.qty_returned, 0, ',', '.')}</td>
              <td class="td-right font-bold" style="color:${it.qty_replaced > 0 ? '#059669' : '#999'};">${numberFormat(it.qty_replaced, 0, ',', '.')}</td>
            </tr>
          `;
        }).join('')
        : '<tr><td colspan="3" class="tbl-empty">Tidak ada item</td></tr>'
    );

    app.popup.open('#popup-retur-detail');
  }

  // ── Popup: Ajukan Retur ───────────────────────────────────
  function openRequestPopup() {
    draftItems = {};
    jQuery('#retur_req_notes').val('');
    renderDraftItems(null);

    jQuery('#retur_req_po').html('<option value="">Memuat...</option>');
    app.popup.open('#popup-retur-request');

    jQuery.ajax({
      type: 'GET',
      url: APP_CONFIG.API_BASE_URL + '/inventory/purchase-retur/eligible-po',
      dataType: 'JSON',
      data: { warehouse_id: warehouseId() },
      success(res) {
        eligiblePo = (res.status === 1) ? (res.data || []) : [];
        if (!eligiblePo.length) {
          jQuery('#retur_req_po').html('<option value="">Tidak ada PO yang bisa diretur</option>');
          return;
        }
        const opts = eligiblePo.map((po) => `<option value="${po.po_id}">${escHtml(po.po_number)} — ${escHtml(po.supplier_name)}</option>`).join('');
        jQuery('#retur_req_po').html('<option value="">-- Pilih PO --</option>' + opts);
      },
      error() {
        eligiblePo = [];
        jQuery('#retur_req_po').html('<option value="">Gagal memuat daftar PO</option>');
      },
    });
  }

  function renderDraftItems(poId) {
    draftItems = {};
    const po = poId ? eligiblePo.find((p) => String(p.po_id) === String(poId)) : null;

    if (!po) {
      jQuery('#retur_req_items').html('<tr><td colspan="4" class="tbl-empty">Pilih PO terlebih dahulu</td></tr>');
      return;
    }

    po.items.forEach((it) => {
      draftItems[it.po_detail_id] = {
        po_detail_id: it.po_detail_id,
        name: it.material_name,
        unit_code: it.unit_code,
        qty_returnable: it.qty_returnable,
        qty: it.qty_returnable,
        reason: 'DAMAGED',
      };
    });

    jQuery('#retur_req_items').html(po.items.map((it) => {
      const unit = (it.unit_code || '').toUpperCase();
      return `
        <tr data-po-detail-id="${it.po_detail_id}">
          <td class="td-left font-semibold">${escHtml(it.material_name)} <span class="text-[11px] text-ink-muted font-semibold">| ${unit}</span></td>
          <td class="td-right font-bold">${numberFormat(it.qty_returnable, 0, ',', '.')}</td>
          <td class="td-center"><input type="number" min="0" max="${it.qty_returnable}" step="1" value="${it.qty_returnable}" class="retur-qty-input mat-input h-8 text-center" data-id="${it.po_detail_id}"></td>
          <td class="td-center">
            <select class="retur-reason-input mat-input h-8" data-id="${it.po_detail_id}">
              <option value="DAMAGED" selected>Rusak</option>
              <option value="WRONG_SPEC">Salah Spek</option>
              <option value="EXPIRED">Kedaluwarsa</option>
              <option value="SHORT_SHIP">Kurang Kirim</option>
              <option value="OTHER">Lainnya</option>
            </select>
          </td>
        </tr>
      `;
    }).join(''));
  }

  function submitRequest() {
    const poId = jQuery('#retur_req_po').val();
    if (!poId) { app.dialog.alert('Pilih PO terlebih dahulu'); return; }

    const notes = (jQuery('#retur_req_notes').val() || '').trim();
    if (!notes) { app.dialog.alert('Catatan/alasan retur wajib diisi'); return; }

    const items = Object.values(draftItems)
      .filter((it) => Number(it.qty) > 0)
      .map((it) => ({
        po_detail_id: it.po_detail_id,
        qty_returned: Number(it.qty),
        reason: it.reason,
      }));

    if (!items.length) { app.dialog.alert('Isi qty retur minimal untuk 1 barang'); return; }

    const $btn = jQuery('#retur_req_btn_submit');
    $btn.prop('disabled', true).text('MEMPROSES...');

    jQuery.ajax({
      type: 'POST',
      url: APP_CONFIG.API_BASE_URL + '/inventory/purchase-retur/create',
      dataType: 'JSON',
      data: {
        purchase_order_id: poId,
        warehouse_id: warehouseId(),
        notes,
        items,
      },
      success(res) {
        $btn.prop('disabled', false).text('AJUKAN RETUR');
        if (res.status === 1) {
          app.popup.close('#popup-retur-request');
          app.toast.create({ text: '✓ ' + (res.message || 'Retur berhasil diajukan'), position: 'center', closeTimeout: 2200 }).open();
          fetchList();
        } else {
          app.dialog.alert('Gagal: ' + (res.message || 'Unknown error'));
        }
      },
      error(xhr) {
        $btn.prop('disabled', false).text('AJUKAN RETUR');
        const res = xhr.responseJSON;
        app.dialog.alert('Gagal mengajukan retur: ' + ((res && res.message) || 'Terjadi kesalahan'));
      },
    });
  }

  fetchList();

  return () => { };
}
