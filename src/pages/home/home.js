import tpl from './home.html?raw';
import { BASE_API_INVENTORY, numberFormat } from '../../lib/config.js';
import { showAuthedShell } from '../../lib/shell.js';
import { Router } from '../../lib/router.js';

const STATUS_CFG = {
  ok: { color: 'var(--color-success)', label: 'AMAN', bg: 'rgba(52,211,153,.12)', border: 'rgba(52,211,153,.3)' },
  low: { color: 'var(--color-primary-light)', label: 'TIPIS', bg: 'rgba(251,146,60,.12)', border: 'rgba(251,146,60,.3)' },
  empty: { color: 'var(--color-danger)', label: 'HABIS', bg: 'rgba(248,113,113,.12)', border: 'rgba(248,113,113,.3)' },
  overstock: { color: 'var(--color-info)', label: 'PENUH', bg: 'rgba(108,142,255,.12)', border: 'rgba(108,142,255,.3)' },
};

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function mount(container) {
  container.innerHTML = tpl;
  showAuthedShell('/home');

  const state = {
    data: [],
    filterStatus: 'all',
    months: 'all',
    searchKeyword: '',
    warehouseId: localStorage.getItem('warehouse_id') || 1,
    selectedPO: {},
    isLoading: false,
  };

  let searchTimer = null;

  // ── Events ──────────────────────────────────────────────
  jQuery('#btn-refresh-home').on('click', resetData);
  jQuery('#link-material-master').on('click', (e) => { e.preventDefault(); Router.navigate('/material'); });
  jQuery('#link-purchase-request').on('click', (e) => {
    e.preventDefault();
    // TODO(iterasi berikutnya): halaman daftar Purchase Request (openListPurchaseRequest di home.js lama).
    app.dialog.alert('Daftar Request PO menyusul di iterasi migrasi berikutnya.');
  });
  jQuery('#home_search').on('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchKeyword = jQuery('#home_search').val() || '';
      renderTable();
    }, 200);
  });
  jQuery('.home-period-btn').on('click', function () {
    setPeriod(Number(jQuery(this).data('months')));
  });
  jQuery('.hc-card').on('click', function () {
    filterByStatus(jQuery(this).data('status'));
  });
  jQuery('#btn-po-clear').on('click', () => {
    state.selectedPO = {};
    renderTable();
    updateFloatingBar();
  });
  jQuery('#btn-po-request').on('click', () => {
    // TODO(iterasi berikutnya): popup Request PO (openRequestPOModal di home.js lama).
    app.dialog.alert('Fitur Request PO menyusul di iterasi migrasi berikutnya.');
  });

  // Delegasi untuk tombol DETAIL di setiap baris (dibuat lewat innerHTML)
  jQuery('#home_mat_table').on('click', '.btn-detail', function (e) {
    e.preventDefault();
    openDetailMaterial(jQuery(this).data('id'));
  });
  jQuery('#home_mat_table').on('change', '.po-checkbox', function () {
    const id = jQuery(this).data('id');
    if (this.checked) state.selectedPO[id] = true;
    else delete state.selectedPO[id];
    updateFloatingBar();
  });

  // ── Data loading ────────────────────────────────────────
  function fetchDashboard() {
    if (state.isLoading) return;
    state.isLoading = true;
    jQuery('#home_mat_table').html('<tr><td colspan="10" class="tbl-empty">Memuat data...</td></tr>');

    jQuery.ajax({
      type: 'POST',
      url: BASE_API_INVENTORY + '/home-dashboard/get-dashboard',
      dataType: 'JSON',
      data: {
        warehouse_id: state.warehouseId,
        months: state.months === 'all' ? 0 : state.months,
        status_filter: state.filterStatus !== 'all' ? state.filterStatus : undefined,
      },
      success(res) {
        state.isLoading = false;
        if (res.status === 1) {
          state.data = res.data.materials || [];
          renderSummary(res.data.summary || {});
          renderTable();
        } else {
          app.dialog.alert('Gagal memuat data: ' + (res.message || 'Unknown error'));
        }
      },
      error() {
        state.isLoading = false;
        app.dialog.alert('Terjadi kesalahan saat memuat data');
      },
    });
  }

  function renderSummary(summary) {
    jQuery('#home_count_ok').text(summary.count_ok || 0);
    jQuery('#home_count_low').text(summary.count_low || 0);
    jQuery('#home_count_empty').text(summary.count_empty || 0);
    jQuery('#home_count_overstock').text(summary.count_overstock || 0);
  }

  function renderTable() {
    let items = state.data;
    const kw = (state.searchKeyword || '').trim().toLowerCase();
    if (kw) {
      items = items.filter((m) => (
        (m.name || '').toLowerCase().includes(kw) ||
        (m.code || '').toLowerCase().includes(kw) ||
        (m.category || '').toLowerCase().includes(kw)
      ));
    }

    jQuery('#home_total_count').text(items.length);
    jQuery('.hc-card').removeClass('ring-2 ring-primary');
    if (state.filterStatus !== 'all') {
      jQuery('#home_card_' + state.filterStatus).addClass('ring-2 ring-primary');
    }

    if (!items.length) {
      const msg = kw ? `Tidak ada barang cocok dengan "${escHtml(state.searchKeyword)}"` : 'Belum ada data barang';
      jQuery('#home_mat_table').html(`<tr><td colspan="10" class="tbl-empty">${msg}</td></tr>`);
      return;
    }

    const isPeriodMode = state.months && state.months !== 'all' && state.months > 0;

    const rows = items.map((m, i) => {
      const cfg = STATUS_CFG[m.stock_status] || { color: '#000' };
      const isEmpty = m.current_stock <= 0;
      const unit = escHtml((m.unit_code || '').toUpperCase());
      const stockValue = isPeriodMode
        ? (typeof m.stock_period !== 'undefined' ? m.stock_period : m.current_stock)
        : m.current_stock;

      const checked = !!state.selectedPO[m.id];
      // NOTE: versi lama punya logika lebih rinci untuk kasus "has_pending_pr"
      // (menampilkan badge "PROSES PO" alih-alih checkbox). Disederhanakan
      // dulu di iterasi ini — checkbox selalu tampil kalau butuh_po > 0.
      const butuhPoCell = m.butuh_po > 0
        ? `<td class="td-center" style="background:#fffbeb;">
             <div class="flex items-center justify-end gap-2 pr-1.5">
               <span class="font-extrabold text-danger">${numberFormat(m.butuh_po, 0, ',', '.')}</span>
               <input type="checkbox" class="po-checkbox w-4 h-4" data-id="${m.id}" ${checked ? 'checked' : ''} />
             </div>
           </td>`
        : `<td class="td-right" style="color:#bbb;">0</td>`;

      return `
        <tr class="${i % 2 !== 0 ? 'bg-surface-raised/50' : ''}">
          <td class="td-center">${i + 1}</td>
          <td class="td-left">
            <div class="font-semibold text-ink-primary">${escHtml(m.name)}
              <span class="text-[10px] text-ink-muted font-semibold">| ${unit || '-'}</span>
            </div>
          </td>
          <td class="td-right" style="color:${m.total_in > 0 ? 'var(--color-success)' : '#bbb'};font-weight:700;">${numberFormat(m.total_in || 0, 0, ',', '.')}</td>
          <td class="td-right" style="color:${m.total_out > 0 ? 'var(--color-danger)' : '#bbb'};font-weight:700;">${numberFormat(m.total_out || 0, 0, ',', '.')}</td>
          <td class="td-right" style="color:${cfg.color};font-weight:800;${isEmpty ? 'animation:homeBlink 1s infinite;' : ''}">${numberFormat(stockValue || 0, 0, ',', '.')}</td>
          <td class="td-right" style="color:#888;font-weight:600;">${numberFormat(m.min_stock, 0, ',', '.')}</td>
          <td class="td-right" style="color:#888;font-weight:600;">${numberFormat(m.max_stock, 0, ',', '.')}</td>
          <td class="td-right" style="color:${m.total_po > 0 ? 'var(--color-info)' : '#bbb'};font-weight:700;">${numberFormat(m.total_po || 0, 0, ',', '.')}</td>
          ${butuhPoCell}
          <td class="td-center">
            <a href="#" class="btn-detail text-primary font-bold text-xs" data-id="${m.id}">DETAIL</a>
          </td>
        </tr>
      `;
    }).join('');

    jQuery('#home_mat_table').html(rows);
  }

  function updateFloatingBar() {
    const hasSelection = Object.keys(state.selectedPO).length > 0;
    jQuery('#po_floating_bar').toggleClass('hidden', !hasSelection);
  }

  function filterByStatus(status) {
    state.filterStatus = state.filterStatus === status ? 'all' : status;
    fetchDashboard();
  }

  function setPeriod(months) {
    jQuery('.home-period-btn').css({ background: '', color: '' }).removeClass('bg-primary text-white');
    if (state.months === months) {
      state.months = 'all';
    } else {
      state.months = months;
      jQuery(`.home-period-btn[data-months="${months}"]`).addClass('bg-primary text-white');
    }
    fetchDashboard();
  }

  function resetData() {
    state.filterStatus = 'all';
    state.months = 'all';
    state.searchKeyword = '';
    jQuery('#home_search').val('');
    jQuery('.home-period-btn').removeClass('bg-primary text-white');
    fetchDashboard();
  }

  // ── Popup detail material ───────────────────────────────
  function openDetailMaterial(materialId) {
    const cached = state.data.find((m) => String(m.id) === String(materialId));
    if (cached) renderDetailInfo(cached);

    jQuery('#popup_mat_history').html('<div class="tbl-empty">Memuat...</div>');
    jQuery('#popup_history_period').text(state.months === 'all' ? 'Semua' : state.months + ' Bulan');

    app.popup.open('#popup-detail-material');

    jQuery.ajax({
      type: 'POST',
      url: BASE_API_INVENTORY + '/home-dashboard/get-material-detail',
      dataType: 'JSON',
      data: {
        material_id: materialId,
        warehouse_id: state.warehouseId,
        days: state.months === 'all' || !state.months ? 0 : state.months * 30,
      },
      success(res) {
        if (res.status === 1) {
          renderDetailInfo(res.data.material);
          renderDetailHistory(res.data.history || []);
        } else {
          jQuery('#popup_mat_history').html('<div class="tbl-empty text-danger">Gagal memuat riwayat</div>');
        }
      },
      error() {
        jQuery('#popup_mat_history').html('<div class="tbl-empty text-danger">Terjadi kesalahan</div>');
      },
    });
  }

  function renderDetailInfo(m) {
    const cfg = STATUS_CFG[m.stock_status] || { color: 'var(--text-secondary)', label: '-' };
    const unit = (m.unit_code || '').toUpperCase();

    jQuery('#popup_mat_name').text(m.name || '-');
    jQuery('#popup_mat_category').text(m.category || '-');

    const hasRack = m.rack_location && m.rack_location !== '-';
    jQuery('#popup_mat_rack').text(hasRack ? m.rack_location : 'Belum diatur');
    jQuery('#popup_rack_section').css('background', hasRack ? '#eff6ff' : '#fefce8');

    jQuery('#popup_mat_stok_val').html(numberFormat(m.current_stock || 0, 0, ',', '.') + ' ' + unit).css('color', cfg.color);
    jQuery('#popup_mat_min_val').text(numberFormat(m.min_stock || 0, 0, ',', '.') + ' ' + unit);
    jQuery('#popup_mat_max_val').text(m.max_stock > 0 ? numberFormat(m.max_stock, 0, ',', '.') + ' ' + unit : '-');

    jQuery('#popup_mat_status').html(
      `<span class="inline-block px-2 py-0.5 rounded text-[11px] font-bold" style="background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border};">${cfg.label}</span>`
    );
  }

  function renderDetailHistory(items) {
    if (!items.length) {
      jQuery('#popup_mat_history').html('<div class="tbl-empty">Belum ada riwayat</div>');
      return;
    }
    // TODO(iterasi berikutnya): filter Masuk/Keluar + sort, seperti versi lama.
    const rows = items.slice(0, 20).map((h) => `
      <div class="flex items-center justify-between px-3 py-2 border-b border-ink-faint text-sm">
        <span class="text-ink-secondary">${escHtml(h.trx_date || '-')}</span>
        <span class="font-semibold ${h.qty >= 0 ? 'text-success' : 'text-danger'}">${h.qty >= 0 ? '+' : ''}${numberFormat(h.qty || 0, 0, ',', '.')}</span>
      </div>
    `).join('');
    jQuery('#popup_mat_history').html(rows);
  }

  fetchDashboard();

  return () => {
    // unmount: lepas listener yang menempel di elemen persistent (di luar container)
    jQuery('.hc-card, .home-period-btn').off();
  };
}