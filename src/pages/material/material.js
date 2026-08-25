import tpl from './material.html?raw';
import { APP_CONFIG } from '../../lib/config.js';
import { numberFormat } from '../../lib/format.js';
import { showAuthedShell } from '../../lib/shell.js';

function escHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const STATUS_CFG = {
    ok: { label: 'Aman', cls: 'mat-status-ok' },
    low: { label: 'Tipis', cls: 'mat-status-low' },
    empty: { label: 'Habis', cls: 'mat-status-empty' },
    overstock: { label: 'Penuh', cls: 'mat-status-overstock' },
};

export function mount(container) {
    container.innerHTML = tpl;
    // Diakses dari Data/Home (bukan tab utama sendiri) -- tetap kirim path asli
    // (bukan null) supaya tab STOCK & baris sub-tabnya tetap kelihatan aktif,
    // lihat STOCK_PATHS di shell.js (material sengaja masuk grup Stock walau
    // tidak py tombol sub-tab sendiri).
    showAuthedShell('/material');

    const state = {
        data: [],
        units: [],
        categories: [],
        searchQuery: '',
        filterStatus: 'all',
        isLoading: false,
        photoFile: null,
        // Cetak Barcode (2026-08-24) -- Map id->material (bukan cuma Set id)
        // supaya seleksi tetap dibawa kalau user ganti search/filter di antara
        // memilih & mencetak (state.data diganti tiap fetchMaterials()).
        selected: new Map(),
    };

    let searchTimer = null;
    const warehouseId = () => localStorage.getItem('warehouse_id') || 1;
    const userId = () => localStorage.getItem('user_id') || '';

    // ── Events ──────────────────────────────────────────────
    jQuery('#mat_search').on('input', () => {
        state.searchQuery = jQuery('#mat_search').val();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(fetchMaterials, 400);
    });
    jQuery('#mat_filter_status').on('change', () => {
        state.filterStatus = jQuery('#mat_filter_status').val();
        fetchMaterials();
    });
    jQuery('#btn-mat-refresh').on('click', () => {
        state.searchQuery = '';
        state.filterStatus = 'all';
        jQuery('#mat_search').val('');
        jQuery('#mat_filter_status').val('all');
        fetchMaterials();
    });
    jQuery('#btn-mat-add').on('click', () => openForm());
    jQuery('#btn-mat-barcode').on('click', printSelectedBarcodes);

    jQuery('#mat_table').on('click', '.btn-tbl--detail', function (e) {
        e.preventDefault();
        openEdit(jQuery(this).data('id'));
    });
    jQuery('#mat_table').on('click', '.btn-tbl--delete', function (e) {
        e.preventDefault();
        deleteMaterial(jQuery(this).data('id'), jQuery(this).data('name'));
    });
    jQuery('#mat_table').on('change', '.mat-row-check', function () {
        const id = jQuery(this).data('id');
        if (this.checked) {
            const m = state.data.find((x) => String(x.id) === String(id));
            if (m) state.selected.set(id, m);
        } else {
            state.selected.delete(id);
        }
        updateSelectAllState();
    });
    jQuery('#mat_select_all').on('change', function () {
        const checkAll = this.checked;
        state.data.forEach((m) => {
            if (checkAll) state.selected.set(m.id, m);
            else state.selected.delete(m.id);
        });
        renderTable();
    });

    jQuery('#mat_form_is_stockable').on('change', function () {
        toggleStockable(this.checked);
    });
    jQuery('#mat_form_btn').on('click', submitForm);
    jQuery('#mat_form_photo_input').on('change', function () {
        onPhotoSelected(this);
    });
    jQuery('#btn-mat-photo-clear').on('click', clearPhoto);

    // ── Dropdown master (unit & kategori) ───────────────────
    function fetchUnits() {
        jQuery.ajax({
            type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/material/get-units', dataType: 'JSON',
            data: { warehouse_id: warehouseId() },
            success(res) {
                if (res.status === 1) {
                    state.units = (res.data && res.data.units) || [];
                    jQuery('#mat_form_unit').html(
                        state.units.map((u) => `<option value="${u.id}">${escHtml(u.name)} (${escHtml(u.code)})</option>`).join('')
                    );
                }
            },
        });
    }

    function fetchCategories() {
        jQuery.ajax({
            type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/material/get-categories', dataType: 'JSON',
            data: { warehouse_id: warehouseId() },
            success(res) {
                if (res.status === 1) {
                    state.categories = (res.data && res.data.categories) || [];
                    jQuery('#mat_form_category').html(
                        '<option value="">— Tanpa Kategori —</option>' +
                        state.categories.map((c) => `<option value="${c.id}">${escHtml(c.name)} (${escHtml(c.code)})</option>`).join('')
                    );
                }
            },
        });
    }

    // ── Data loading ────────────────────────────────────────
    function fetchMaterials() {
        if (state.isLoading) return;
        state.isLoading = true;
        jQuery('#mat_table').html('<tr><td colspan="7" class="tbl-empty">Memuat data...</td></tr>');

        const payload = { warehouse_id: warehouseId(), user_id: userId() };
        if (state.searchQuery) payload.search = state.searchQuery;
        if (state.filterStatus !== 'all') payload.status_filter = state.filterStatus;

        jQuery.ajax({
            type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/material/get-materials', dataType: 'JSON', data: payload,
            success(res) {
                state.isLoading = false;
                if (res.status === 1) {
                    state.data = res.data.materials || [];
                    renderTable();
                } else {
                    app.dialog.alert('Gagal memuat data: ' + (res.message || ''));
                }
            },
            error() {
                state.isLoading = false;
                app.dialog.alert('Terjadi kesalahan saat memuat data material');
            },
        });
    }

    function renderTable() {
        const items = state.data;
        jQuery('#mat_total_count').text(items.length);

        if (!items.length) {
            const msg = state.searchQuery ? 'Tidak ada material yang cocok' : 'Belum ada data material';
            jQuery('#mat_table').html(`<tr><td colspan="8" class="tbl-empty">${msg}</td></tr>`);
            updateSelectAllState();
            return;
        }

        const rows = items.map((m, i) => {
            const cfg = STATUS_CFG[m.stock_status] || { label: '-', cls: '' };
            const stokColor = m.current_stock <= 0 ? 'var(--color-danger)' : (m.stock_status === 'low' ? 'var(--color-primary)' : 'var(--text-primary)');
            const minMaxCell = m.is_stockable === false
                ? `<td class="td-center whitespace-nowrap" colspan="1" style="font-weight:700;font-size:11px;background:#fffbeb;color:#d97706;">PO SPK</td>`
                : `<td class="td-right whitespace-nowrap" style="font-weight:600;">${numberFormat(m.min_stock, 0, ',', '.')}</td>`;
            const isChecked = state.selected.has(m.id);

            return `
        <tr class="${i % 2 !== 0 ? 'bg-surface-raised/50' : ''}">
          <td class="td-center whitespace-nowrap"><input type="checkbox" class="mat-row-check w-4 h-4 accent-green-600 cursor-pointer" data-id="${m.id}" ${isChecked ? 'checked' : ''}></td>
          <td class="td-center font-semibold whitespace-nowrap">${i + 1}</td>
          <td class="td-left whitespace-nowrap">${escHtml(m.code || '-')}</td>
          <td class="td-left font-semibold whitespace-nowrap">${escHtml(m.name)} <span class="text-[10px] text-ink-muted font-semibold">| ${escHtml(m.unit_code || m.unit_abbr || '-')}</span></td>
          ${minMaxCell}
          <td class="td-right whitespace-nowrap" style="font-weight:700;color:${stokColor};">${numberFormat(m.current_stock, 0, ',', '.')}</td>
          <td class="td-center whitespace-nowrap"><span class="mat-badge ${cfg.cls}">${cfg.label}</span></td>
          <td class="td-center whitespace-nowrap">
            <a href="#" class="btn-tbl--detail" data-id="${m.id}">Edit</a>
            <a href="#" class="btn-tbl--delete" data-id="${m.id}" data-name="${escHtml(m.name)}">Hapus</a>
          </td>
        </tr>
      `;
        }).join('');

        jQuery('#mat_table').html(rows);
        updateSelectAllState();
    }

    // ── Cetak Barcode (2026-08-24) ────────────────────────────
    // Checkbox per baris + "pilih semua" di header tabel -- toolbar
    // #btn-mat-barcode generate 1 PDF berisi label semua material yang
    // dicentang (lihat src/lib/barcodeLabels.js). Nilai barcode-nya sendiri
    // sudah dibuat backend (auto-generate saat material dibuat), fitur ini
    // murni merender & mencetaknya.
    function updateSelectAllState() {
        const visibleIds = state.data.map((m) => m.id);
        const allChecked = visibleIds.length > 0 && visibleIds.every((id) => state.selected.has(id));
        jQuery('#mat_select_all').prop('checked', allChecked);
        jQuery('#btn-mat-barcode').attr(
            'title',
            state.selected.size > 0 ? `Cetak Barcode (${state.selected.size} dipilih)` : 'Cetak Barcode (pilih material dulu via checkbox)'
        );
    }

    function printSelectedBarcodes() {
        const materials = Array.from(state.selected.values());
        if (!materials.length) {
            app.dialog.alert('Pilih minimal 1 material (centang di kolom paling kiri) untuk dicetak barcode-nya.');
            return;
        }
        const withoutBarcode = materials.filter((m) => !m.barcode).length;
        const warn = withoutBarcode > 0 ? `\n\n${withoutBarcode} material tidak punya barcode, akan ditandai kosong di label.` : '';

        app.dialog.confirm(`Cetak ${materials.length} label barcode?${warn}`, 'Konfirmasi', async () => {
            app.dialog.preloader('Membuat PDF...');
            try {
                // Dynamic import -- jsPDF (+ dependensi internalnya, html2canvas/
                // dompurify, ikut kebawa walau tidak dipakai) berat (~250KB gzip).
                // Di-lazy-load di sini (bukan static import di atas) supaya TIDAK
                // ikut bundle utama app (SPA hash-router, 1 bundle utk semua
                // halaman) -- cuma diunduh/parse sekali saat tombol ini benar-benar
                // dipakai.
                const { printBarcodeLabels } = await import('../../lib/barcodeLabels.js');
                await printBarcodeLabels(materials);
            } catch (err) {
                console.error('[material] printBarcodeLabels error:', err);
                app.dialog.alert('Gagal membuat PDF barcode.');
            } finally {
                app.dialog.close();
            }
        });
    }

    // ── Form tambah/edit ─────────────────────────────────────
    function toggleStockable(isStockable) {
        jQuery('#mat_form_minmax_section').toggleClass('hidden', !isStockable);
        jQuery('#mat_form_stockable_title').text(isStockable ? 'Dapat Di-Stock' : 'PO by SPK (tanpa stok)');
        jQuery('#mat_form_stockable_label').toggleClass('border-green-400', isStockable).toggleClass('border-green-200', !isStockable);
    }

    function openForm(editData) {
        jQuery('#mat_form_id').val('');
        jQuery('#mat_form_code_display').val('');
        jQuery('#mat_form_code_wrap').addClass('hidden');
        jQuery('#mat_form_barcode_wrap').addClass('hidden');
        jQuery('#mat_form_category').val('');
        jQuery('#mat_form_name').val('');
        jQuery('#mat_form_unit').val(state.units.length ? state.units[0].id : '');
        jQuery('#mat_form_min_stock').val('0');
        jQuery('#mat_form_max_stock').val('0');
        jQuery('#mat_form_rack_location').val('');

        state.photoFile = null;
        jQuery('#mat_form_photo_input').val('');
        jQuery('#mat_form_photo_preview_wrap').addClass('hidden');
        jQuery('#mat_form_photo_preview').attr('src', '');
        jQuery('#mat_form_photo_zone').removeClass('hidden');

        jQuery('#mat_form_is_stockable').prop('checked', true);
        toggleStockable(true);

        if (editData) {
            jQuery('#mat_form_id').val(editData.id);
            jQuery('#mat_form_code_display').val(editData.code);
            jQuery('#mat_form_code_wrap').removeClass('hidden');
            if (editData.barcode) {
                jQuery('#mat_form_barcode_display').val(editData.barcode);
                jQuery('#mat_form_barcode_wrap').removeClass('hidden');
            }
            jQuery('#mat_form_category').val(editData.category_id || '');
            jQuery('#mat_form_name').val(editData.name);
            jQuery('#mat_form_unit').val(editData.unit_id);
            jQuery('#mat_form_min_stock').val(editData.min_stock || 0);
            jQuery('#mat_form_max_stock').val(editData.max_stock || 0);
            jQuery('#mat_form_rack_location').val(editData.rack_location || '');

            if (editData.photo_url) {
                jQuery('#mat_form_photo_preview').attr('src', APP_CONFIG.IMAGE_BASE_URL + '/' + editData.photo_url);
                jQuery('#mat_form_photo_preview_wrap').removeClass('hidden');
                jQuery('#mat_form_photo_zone').addClass('hidden');
            }

            const isStockable = editData.is_stockable !== undefined ? !!editData.is_stockable : true;
            jQuery('#mat_form_is_stockable').prop('checked', isStockable);
            toggleStockable(isStockable);
        }

        app.popup.open('#popup-material-form');
    }

    function openEdit(materialId) {
        const m = state.data.find((x) => String(x.id) === String(materialId));
        if (m) openForm(m);
    }

    function onPhotoSelected(input) {
        if (!input.files || !input.files[0]) return;
        state.photoFile = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            jQuery('#mat_form_photo_preview').attr('src', e.target.result);
            jQuery('#mat_form_photo_preview_wrap').removeClass('hidden');
            jQuery('#mat_form_photo_zone').addClass('hidden');
        };
        reader.readAsDataURL(state.photoFile);
    }

    function clearPhoto() {
        state.photoFile = null;
        jQuery('#mat_form_photo_input').val('');
        jQuery('#mat_form_photo_preview').attr('src', '');
        jQuery('#mat_form_photo_preview_wrap').addClass('hidden');
        jQuery('#mat_form_photo_zone').removeClass('hidden');
    }

    function submitForm() {
        const id = jQuery('#mat_form_id').val();
        const name = jQuery('#mat_form_name').val().trim();
        const unitId = jQuery('#mat_form_unit').val();
        const isStockable = jQuery('#mat_form_is_stockable').is(':checked');
        const minStock = isStockable ? (parseFloat(jQuery('#mat_form_min_stock').val()) || 0) : 0;
        const maxStock = isStockable ? (parseFloat(jQuery('#mat_form_max_stock').val()) || 0) : 0;

        if (!name) { app.dialog.alert('Nama material wajib diisi'); return; }
        if (!unitId) { app.dialog.alert('Satuan wajib dipilih'); return; }
        if (isStockable && maxStock > 0 && maxStock < minStock) {
            app.dialog.alert('Max stok harus lebih besar atau sama dengan Min stok');
            return;
        }

        const url = APP_CONFIG.API_BASE_URL + '/inventory' + (id ? '/material/update-material' : '/material/store-material');
        const formData = new FormData();
        formData.append('warehouse_id', warehouseId());
        formData.append('user_id', userId());
        formData.append('name', name);
        formData.append('is_stockable', isStockable ? 1 : 0);
        formData.append('category_id', jQuery('#mat_form_category').val() || '');
        formData.append('unit_id', unitId);
        formData.append('min_stock', minStock);
        formData.append('max_stock', maxStock);
        formData.append('rack_location', jQuery('#mat_form_rack_location').val().trim() || '');
        if (id) formData.append('material_id', id);
        if (state.photoFile) formData.append('photo', state.photoFile, state.photoFile.name || 'photo.jpg');

        jQuery('#mat_form_btn').css('opacity', '.5').prop('disabled', true);

        jQuery.ajax({
            type: 'POST', url, dataType: 'JSON', data: formData, processData: false, contentType: false,
            success(res) {
                jQuery('#mat_form_btn').css('opacity', '1').prop('disabled', false);
                if (res.status === 1) {
                    app.popup.close('#popup-material-form');
                    app.dialog.alert(id ? 'Material berhasil diupdate' : 'Material berhasil ditambahkan');
                    fetchMaterials();
                } else {
                    app.dialog.alert('Gagal: ' + (res.message || ''));
                }
            },
            error() {
                jQuery('#mat_form_btn').css('opacity', '1').prop('disabled', false);
                app.dialog.alert('Terjadi kesalahan');
            },
        });
    }

    function deleteMaterial(materialId, materialName) {
        app.dialog.confirm(`Hapus material "${materialName}"?`, 'Konfirmasi', () => {
            jQuery.ajax({
                type: 'POST', url: APP_CONFIG.API_BASE_URL + '/inventory/material/delete-material', dataType: 'JSON',
                data: { material_id: materialId, warehouse_id: warehouseId(), user_id: userId() },
                success(res) {
                    if (res.status === 1) {
                        app.dialog.alert('Material berhasil dihapus');
                        fetchMaterials();
                    } else {
                        app.dialog.alert('Gagal: ' + (res.message || ''));
                    }
                },
                error() { app.dialog.alert('Terjadi kesalahan'); },
            });
        });
    }

    fetchUnits();
    fetchCategories();
    fetchMaterials();

    return () => { };
}