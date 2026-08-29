import tpl from './partner.html?raw';
import { APP_CONFIG } from '../../lib/config.js';
import { numberFormat, formatDateShort } from '../../lib/format.js';
import { showAuthedShell } from '../../lib/shell.js';

function escHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function formatCurrency(n) { return 'Rp ' + numberFormat(n || 0, 0, ',', '.'); }
// Foto referensi produk (t_penjualan_detail_performa.gambar) -- disajikan dari
// backend-production langsung (bukan lewat backend-migrasi), sama pola dgn
// produksi-apk/www/js/partner/approval.js (BASE_API + 'performa_image/' + gambar).
function fotoReferensiUrl(gambar) {
    return gambar ? `${APP_CONFIG.IMAGE_BASE_URL}/performa_image/${gambar}` : null;
}
// "Hari ini >= tgl_deadline" -- dibandingkan per-tanggal (jam diabaikan),
// supaya berkedip pas tepat di hari deadline, bukan cuma sesudahnya.
function isDeadlineOverdue(tglDeadline) {
    if (!tglDeadline) return false;
    const deadline = new Date(tglDeadline);
    if (isNaN(deadline)) return false;
    const today = new Date();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const deadlineDateOnly = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
    return todayDateOnly >= deadlineDateOnly;
}

// Kelas tombol aksi bergaya kotak, dipakai konsisten di SELURUH menu
// Partner (list utama, popup History, popup Terima Barang). Abu-abu
// default sengaja dibuat cukup gelap (bg-ink-secondary, bukan
// bg-surface-raised yang mepet putih) supaya tetap kebaca sbg tombol,
// bukan cuma teks polos.
const BTN_BASE = 'inline-block w-[72px] text-center px-2 py-1 rounded text-[11px] font-bold whitespace-nowrap';
const BTN_DEFAULT = 'bg-ink-secondary text-white';
const BTN_SUCCESS = 'bg-success text-white';
const BTN_INFO = 'bg-info text-white';
function removePrefix(str, prefix = 'INV_') {
    if (!str) return '-';
    return str.toString().replace(prefix, '').replace(/^0/, '');
}
function spkCode(data) {
    const tgl = data.penjualan_tanggal ? new Date(data.penjualan_tanggal) : null;
    const tglStr = tgl ? String(tgl.getDate()).padStart(2, '0') + String(tgl.getMonth() + 1).padStart(2, '0') + String(tgl.getFullYear()).slice(-2) : '';
    return tglStr + '-' + removePrefix(data.penjualan_id);
}

// "Selesai" (masuk History) = SUDAH di-approve/ACC oleh admin pusat
// (pt.status_approval), BUKAN cuma krn barang sudah diterima penuh --
// revisi permintaan: barang bisa saja sudah full diterima tapi masih
// menunggu approval, jadi harus tetap nongol di list aktif dulu.
function isApproved(d) {
    return (d.status_approval || '').toUpperCase() === 'ACC';
}

function buildPartnerRow(d) {
    // "Sudah diterima penuh" (utk warna/label tombol Terima & nyembunyiin
    // tombol Material) -- ini murni soal progres barang, TERPISAH dari
    // status approval di atas.
    const jumlahDiterima = parseInt(d.jumlah_diterima) || 0;
    const jumlahTotal = parseInt(d.jumlah) || 0;
    const isFullyReceived = jumlahTotal > 0 && jumlahDiterima >= jumlahTotal;
    const isPartiallyReceived = jumlahDiterima > 0 && !isFullyReceived;

    // Tombol Material dianggap "ada nilai" kalau sudah ada minimal 1 baris
    // detail material yang diinput (field `details`, dari
    // PartnerController@getPartnerTransactionIndex -- bukan dari endpoint
    // material terpisah, supaya tidak perlu request tambahan per row).
    const hasMaterial = Array.isArray(d.details) && d.details.length > 0;

    // Retur AKTIF (BELUM/PROSES, blm selesai) -- dipakai utk warna latar
    // baris. Sengaja pakai total_retur_aktif (bukan total_retur_selesai/
    // retur_data mentah) supaya baris yg retur-nya sudah SELESAI tidak
    // nyangkut merah selamanya.
    const hasActiveRetur = (parseInt(d.total_retur_aktif) || 0) > 0;

    const materialBtnClass = hasMaterial ? BTN_SUCCESS : BTN_DEFAULT;
    const terimaBtnClass = isFullyReceived
        ? BTN_INFO
        : (isPartiallyReceived ? BTN_SUCCESS : BTN_DEFAULT);

    // Overdue cuma relevan buat transaksi yang masih aktif -- item History
    // (sudah di-ACC) tidak perlu ikut berkedip walau tgl_deadline-nya sudah lewat.
    const overdue = !isApproved(d) && isDeadlineOverdue(d.tgl_deadline);

    return `
    <tr class="${hasActiveRetur ? 'bg-red-50' : ''}">
      <td class="td-left font-semibold whitespace-nowrap">${escHtml(spkCode(d))}</td>
      <td class="td-left font-semibold whitespace-nowrap">${escHtml(d.client_nama || '-')}</td>
      <td class="td-left font-semibold whitespace-nowrap">${escHtml(d.nama_partner || '-')}</td>
      <td class="td-left whitespace-nowrap">${escHtml(d.produk_keterangan_kustom || d.penjualan_jenis || '-')}</td>
      <td class="td-center whitespace-nowrap ${overdue ? 'deadline-overdue' : ''}">${d.tgl_deadline ? formatDateShort(d.tgl_deadline) : '-'}</td>
      <td class="td-left whitespace-nowrap">
        ${!isFullyReceived ? `<a href="#" class="btn-open-material ${BTN_BASE} mr-1.5 ${materialBtnClass}" data-id="${d.id_partner_transaksi}" data-name="${escHtml(d.nama_partner)}">Material</a>` : ''}
        <a href="#" class="btn-open-receiving ${BTN_BASE} ${terimaBtnClass}" data-id="${d.id_partner_transaksi}" data-name="${escHtml(d.nama_partner)}">${isFullyReceived ? 'Bukti' : 'Terima'}</a>
      </td>
    </tr>
  `;
}

const ITEMS_PER_PAGE = 20;

export function mount(container) {
    container.innerHTML = tpl;
    showAuthedShell('/partner');

    const state = {
        currentPage: 1,
        partnerData: [],
        filteredData: [],
        historyData: [],
        filteredHistoryData: [],
        currentPartnerId: null,
        materialData: [],
        materialForm: { id_partner_transaksi: null, nama_partner: null, spk: null },
        materialSementara: [],
    };
    const addMaterialPhoto = { file: null }; // foto yang lagi dipilih di form (belum "ditambah ke list")

    // ── Events ──────────────────────────────────────────────
    jQuery('#btn-partner-refresh').on('click', () => { jQuery('#filter_perusahaan_partner').val(''); fetchPartnerData(); });
    jQuery('#filter_perusahaan_partner').on('input', cariPerusahaan);
    jQuery('#btn-partner-history').on('click', openHistory);
    jQuery('#filter_history_partner').on('input', cariHistoryPartner);

    jQuery('#data_partner').on('click', '.btn-open-material', function (e) {
        e.preventDefault();
        openMaterialModal(jQuery(this).data('id'), jQuery(this).data('name'));
    });
    jQuery('#data_partner').on('click', '.btn-open-receiving', function (e) {
        e.preventDefault();
        openReceivingModal(jQuery(this).data('id'), jQuery(this).data('name'), false);
    });
    // Baris di popup History pakai tombol yang sama persis (Material/Terima/Bukti),
    // TAPI khusus '.btn-open-receiving' dibuka dalam mode readOnly=true --
    // item History sudah di-ACC, jadi tombol "+ Tambah Penerimaan" tidak
    // relevan lagi di sini (revisi: fitur tambah tidak boleh muncul di popup
    // yang dibuka dari History).
    jQuery('#data_history_partner').on('click', '.btn-open-material', function (e) {
        e.preventDefault();
        openMaterialModal(jQuery(this).data('id'), jQuery(this).data('name'));
    });
    jQuery('#data_history_partner').on('click', '.btn-open-receiving', function (e) {
        e.preventDefault();
        openReceivingModal(jQuery(this).data('id'), jQuery(this).data('name'), true);
    });

    jQuery('#btn-open-add-material').on('click', bukaPopupTambahMaterial);
    jQuery('#btn-tambah-material-list').on('click', tambahMaterialKeList);
    jQuery('#mat_add_photo_input').on('change', function () { onAddPhotoSelected(this); });
    jQuery('#btn-mat-add-photo-clear').on('click', clearAddPhoto);
    jQuery('#btn-simpan-semua-material').on('click', simpanSemuaMaterial);
    jQuery('#list_material_sementara').on('click', '.btn-hapus-sementara', function () {
        hapusMaterialSementara(jQuery(this).data('idx'));
    });
    // Format ke angka polos saat blur (buang karakter non-digit), dan Enter
    // di salah satu dari 3 field ini langsung "tambah ke list" -- sama
    // seperti perilaku form aslinya.
    jQuery('#input_harga_material').on('blur', function () {
        this.value = parseInt(this.value.replace(/\D/g, '')) || 0;
    });
    jQuery('#input_nama_material, #input_jumlah_material, #input_harga_material').on('keypress', (e) => {
        if (e.which === 13) { e.preventDefault(); tambahMaterialKeList(); }
    });

    // ── Data loading ─────────────────────────────────────────
    function fetchPartnerData() {
        app.dialog.preloader('Memuat data...');
        jQuery.ajax({
            url: APP_CONFIG.API_BASE_URL + '/partner', method: 'GET', contentType: 'application/json',
            success(result) {
                app.dialog.close();
                const setahunLalu = new Date();
                setahunLalu.setFullYear(setahunLalu.getFullYear() - 1);

                const allData = result.data || [];
                state.partnerData = allData.filter((d) => d.dt_record && new Date(d.dt_record) >= setahunLalu);
                // History = sudah di-ACC (lihat isApproved()), BUKAN lagi
                // sekadar "sudah diterima penuh" -- revisi permintaan.
                state.filteredData = state.partnerData.filter((d) => !isApproved(d));
                state.historyData = state.partnerData.filter((d) => isApproved(d));
                state.currentPage = 1;
                renderData();
            },
            error() { app.dialog.close(); app.dialog.alert('Gagal memuat data'); },
        });
    }

    function matchesSearchTerm(d, term) {
        return (
            (d.client_nama || '').toLowerCase().includes(term) ||
            (d.nama_partner || '').toLowerCase().includes(term) ||
            (d.penjualan_id || '').toLowerCase().includes(term)
        );
    }

    function cariPerusahaan() {
        const term = (jQuery('#filter_perusahaan_partner').val() || '').toLowerCase().trim();
        const activeData = state.partnerData.filter((d) => !isApproved(d));
        state.filteredData = !term ? activeData : activeData.filter((d) => matchesSearchTerm(d, term));
        state.currentPage = 1;
        renderData();
    }

    // ── Popup: History (transaksi yang sudah di-ACC/approve) ────
    function renderHistoryTable() {
        jQuery('#jumlah_history_data').text(state.filteredHistoryData.length);
        jQuery('#data_history_partner').html(
            state.filteredHistoryData.length
                ? state.filteredHistoryData.map(buildPartnerRow).join('')
                : '<tr><td colspan="6" class="tbl-empty">Belum ada history</td></tr>'
        );
    }

    function cariHistoryPartner() {
        const term = (jQuery('#filter_history_partner').val() || '').toLowerCase().trim();
        state.filteredHistoryData = !term ? state.historyData : state.historyData.filter((d) => matchesSearchTerm(d, term));
        renderHistoryTable();
    }

    function openHistory() {
        jQuery('#filter_history_partner').val('');
        state.filteredHistoryData = state.historyData;
        renderHistoryTable();
        app.popup.open('#popup-partner-history');
    }

    // ── Render list + pagination ─────────────────────────────
    function renderData() {
        const total = state.filteredData.length;
        const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
        const start = (state.currentPage - 1) * ITEMS_PER_PAGE;
        const pageData = state.filteredData.slice(start, start + ITEMS_PER_PAGE);

        jQuery('#jumlah_data_partner').text(total);

        if (!pageData.length) {
            jQuery('#data_partner').html('<tr><td colspan="6" class="tbl-empty">Tidak ada data partner</td></tr>');
        } else {
            jQuery('#data_partner').html(pageData.map(buildPartnerRow).join(''));
        }

        jQuery('#tombol_paginasi').html(createPaginationButtons(state.currentPage, totalPages));
    }

    function createPaginationButtons(current, total) {
        if (total <= 1) return '';
        return `
      <div class="flex items-center justify-between gap-2">
        <button class="pag-btn px-3 py-1.5 text-sm font-bold rounded border border-ink-faint ${current <= 1 ? 'opacity-30 pointer-events-none' : ''}" data-page="${current - 1}">‹ Prev</button>
        <span class="text-sm font-semibold text-ink-secondary">${current} / ${total}</span>
        <button class="pag-btn px-3 py-1.5 text-sm font-bold rounded border border-ink-faint ${current >= total ? 'opacity-30 pointer-events-none' : ''}" data-page="${current + 1}">Next ›</button>
      </div>
    `;
    }
    jQuery('#tombol_paginasi').on('click', '.pag-btn', function () {
        state.currentPage = parseInt(jQuery(this).data('page'));
        renderData();
    });

    // ── Modal: Material ───────────────────────────────────────
    function openMaterialModal(partnerId, partnerName) {
        state.currentPartnerId = partnerId;
        jQuery('#nama_partner_material').text(partnerName || '-');
        jQuery('#data_material_partner').html('<tr><td colspan="5" class="tbl-empty">Memuat data...</td></tr>');
        fetchMaterialData(partnerId);
        app.popup.open('#popup-partner-material');
    }

    function fetchMaterialData(partnerId) {
        // [FIX] Endpoint aslinya GET /material/{id} (dipakai sj-apk) sudah TIDAK
        // ADA lagi di backend -- yang benar POST /material/ dengan
        // id_partner_transaksi di body, dan hasilnya nested di data.material
        // (bukan data langsung). Lihat MaterialController@getMaterialByPartner.
        jQuery.ajax({
            url: `${APP_CONFIG.API_BASE_URL}/partner/material`, method: 'POST', contentType: 'application/json',
            data: JSON.stringify({ id_partner_transaksi: partnerId }),
            success(result) {
                if (partnerId !== state.currentPartnerId) return;
                state.materialData = (result.data && result.data.material) || [];
                renderMaterialData();
            },
            error() {
                if (partnerId !== state.currentPartnerId) return;
                state.materialData = [];
                renderMaterialData();
                app.dialog.alert('Gagal memuat data material');
            },
        });
    }

    function renderMaterialData() {
        jQuery('#total_material_partner').text(state.materialData.length);
        if (!state.materialData.length) {
            jQuery('#data_material_partner').html('<tr><td colspan="5" class="tbl-empty">Tidak ada data material</td></tr>');
            return;
        }
        // Field yang benar (sesuai MaterialController): nama, jumlah, harga,
        // total_harga -- BUKAN nama_material/total seperti di sj-apk lama.
        jQuery('#data_material_partner').html(state.materialData.map((m, i) => `
      <tr>
        <td class="td-center whitespace-nowrap">${i + 1}</td>
        <td class="td-left whitespace-nowrap">${escHtml(m.nama || '-')}</td>
        <td class="td-center whitespace-nowrap">${numberFormat(m.jumlah || 0, 0, ',', '.')}</td>
        <td class="td-right whitespace-nowrap">${formatCurrency(m.harga || 0)}</td>
        <td class="td-right whitespace-nowrap">${formatCurrency(m.total_harga || 0)}</td>
      </tr>
    `).join(''));
    }

    // ── Modal: Tambah Material (staging) ─────────────────────
    function bukaPopupTambahMaterial() {
        const partnerData = state.partnerData.find((p) => p.id_partner_transaksi === state.currentPartnerId);
        if (partnerData) {
            state.materialForm = {
                id_partner_transaksi: partnerData.id_partner_transaksi,
                nama_partner: partnerData.nama_partner,
                spk: spkCode(partnerData),
            };
            jQuery('#info_nama_partner').text(state.materialForm.nama_partner || '-');
            jQuery('#info_spk').text(state.materialForm.spk || '-');
        }
        resetFormMaterial();
        state.materialSementara = [];
        renderMaterialSementara();
        app.popup.open('#popup-partner-add-material');
    }

    function resetFormMaterial() {
        jQuery('#input_nama_material, #input_jumlah_material, #input_harga_material, #input_keterangan_material').val('');
        clearAddPhoto();
    }

    function onAddPhotoSelected(input) {
        if (!input.files || !input.files[0]) return;
        addMaterialPhoto.file = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            jQuery('#mat_add_photo_preview').attr('src', e.target.result);
            jQuery('#mat_add_photo_preview_wrap').removeClass('hidden');
            jQuery('#mat_add_photo_zone').addClass('hidden');
        };
        reader.readAsDataURL(addMaterialPhoto.file);
    }

    function clearAddPhoto() {
        addMaterialPhoto.file = null;
        jQuery('#mat_add_photo_input').val('');
        jQuery('#mat_add_photo_preview').attr('src', '');
        jQuery('#mat_add_photo_preview_wrap').addClass('hidden');
        jQuery('#mat_add_photo_zone').removeClass('hidden');
    }

    function tambahMaterialKeList() {
        const nama = jQuery('#input_nama_material').val().trim();
        const jumlah = parseInt(jQuery('#input_jumlah_material').val()) || 0;
        const harga = parseInt(jQuery('#input_harga_material').val().replace(/\D/g, '')) || 0;
        const keterangan = jQuery('#input_keterangan_material').val().trim();

        if (!nama) { app.dialog.alert('Nama material wajib diisi'); jQuery('#input_nama_material').focus(); return; }
        if (jumlah <= 0) { app.dialog.alert('Qty harus lebih dari 0'); jQuery('#input_jumlah_material').focus(); return; }
        if (harga <= 0) { app.dialog.alert('Harga harus lebih dari 0'); jQuery('#input_harga_material').focus(); return; }

        // Foto ikut "menempel" ke item ini saat ditambah ke list (bukan langsung
        // di-upload) -- backend baru terima file-nya nanti pas Simpan Semua.
        state.materialSementara.push({ nama, jumlah, harga, keterangan, total: jumlah * harga, photoFile: addMaterialPhoto.file });
        resetFormMaterial();
        renderMaterialSementara();
        jQuery('#input_nama_material').focus();
    }

    function renderMaterialSementara() {
        if (!state.materialSementara.length) {
            jQuery('#list_material_sementara').html('<div class="text-xs text-ink-muted text-center py-3">Belum ada material ditambahkan</div>');
            return;
        }
        jQuery('#list_material_sementara').html(state.materialSementara.map((m, i) => `
      <div class="flex items-center justify-between bg-surface-raised rounded-md px-3 py-2 text-sm">
        <div>
          <div class="font-semibold">${escHtml(m.nama)} ${m.photoFile ? '<span class="text-[10px] text-info font-bold">📷 ada foto</span>' : ''}</div>
          <div class="text-xs text-ink-secondary">${numberFormat(m.jumlah, 0, ',', '.')} × ${formatCurrency(m.harga)} = ${formatCurrency(m.total)}</div>
        </div>
        <button class="btn-hapus-sementara text-danger text-xs font-bold" data-idx="${i}">Hapus</button>
      </div>
    `).join(''));
    }

    function hapusMaterialSementara(idx) {
        state.materialSementara.splice(idx, 1);
        renderMaterialSementara();
    }

    function simpanSemuaMaterial() {
        if (!state.materialSementara.length) { app.dialog.alert('Belum ada material yang ditambahkan'); return; }
        if (!state.materialForm.id_partner_transaksi) { app.dialog.alert('ID Partner Transaksi tidak ditemukan'); return; }

        const grandTotal = state.materialSementara.reduce((sum, m) => sum + m.total, 0);
        app.dialog.confirm(`Simpan ${state.materialSementara.length} material ke database?<br>Grand Total: ${formatCurrency(grandTotal)}`, 'Konfirmasi Simpan', () => {
            // [FIX] Backend (MaterialController@addMaterialByPartner) terima foto
            // sebagai FILE upload -- WAJIB multipart/form-data (FormData), tidak
            // bisa JSON.stringify() biasa seperti sebelumnya. Catatan: field
            // "keterangan" TIDAK ada di validasi/kolom backend saat ini, jadi
            // tetap dikirim (harmless) tapi kemungkinan besar diabaikan server.
            const requests = state.materialSementara.map((m) => {
                const fd = new FormData();
                fd.append('id_partner_transaksi', state.materialForm.id_partner_transaksi);
                fd.append('nama', m.nama);
                fd.append('jumlah', m.jumlah);
                fd.append('harga', m.harga);
                if (m.keterangan) fd.append('keterangan', m.keterangan);
                if (m.photoFile) fd.append('foto_bukti_material', m.photoFile, m.photoFile.name || 'foto.jpg');

                return jQuery.ajax({
                    url: APP_CONFIG.API_BASE_URL + '/partner/material/add-partner-material', method: 'POST',
                    data: fd, processData: false, contentType: false,
                });
            });

            Promise.all(requests).then((results) => {
                const successCount = results.filter((r) => r.success).length;
                app.dialog.alert(`${successCount} dari ${state.materialSementara.length} material berhasil disimpan`);
                state.materialSementara = [];
                resetFormMaterial();
                renderMaterialSementara();
                app.popup.close('#popup-partner-add-material');
                fetchMaterialData(state.currentPartnerId);
            }).catch(() => {
                app.dialog.alert('Gagal menyimpan sebagian/semua material');
            });
        });
    }

    // ── Modal: Terima (riwayat penerimaan bertahap + retur/rusak) ────
    // Porting penuh dari js/partner/penerimaan.js + js/partner/retur.js
    // (endpoint /delivery & /delivery/add-delivery, /retur/input-retur,
    // /retur/input-penerimaan-retur -- lihat EkspedisiController draft).
    const RECEIVING_STATE = {
        currentPartnerTransaksiId: null,
        currentPartnerName: null,
        currentSpkCode: null,
        currentGambar: null, // t_penjualan_detail_performa.gambar -- foto referensi produk buat kroscek visual saat input Terima Barang
        currentQuantity: 0,
        receivingList: [],
        tempReceivingData: null,
        readOnly: false, // true kalau dibuka dari popup History (sudah ACC)
    };
    const RETUR_STATE = { idDetailPengiriman: null, jumlahDiterima: 0, jumlahReturAktif: 0, maxRetur: 0, photoFile: null };
    const PENERIMAAN_RETUR_STATE = { idRetur: null, jumlahRetur: 0, jumlahSudahDiterima: 0, maxPenerimaan: 0, photoFile: null };
    const uploadPhoto = { bukti: null, dokumen: null };

    function openReceivingModal(partnerId, partnerName, readOnly = false) {
        const d = state.partnerData.find((x) => x.id_partner_transaksi === partnerId);
        if (!d) return;

        RECEIVING_STATE.currentPartnerTransaksiId = partnerId;
        RECEIVING_STATE.currentPartnerName = partnerName || '-';
        RECEIVING_STATE.currentSpkCode = spkCode(d);
        RECEIVING_STATE.currentGambar = d.gambar || null;
        RECEIVING_STATE.currentQuantity = d.jumlah || 0;
        RECEIVING_STATE.readOnly = readOnly;

        jQuery('#nama_partner_receiving').text(RECEIVING_STATE.currentPartnerName);
        jQuery('#receiving-spk-code').text(RECEIVING_STATE.currentSpkCode);
        const receivingRefUrl = fotoReferensiUrl(RECEIVING_STATE.currentGambar);
        jQuery('#receiving_ref_gambar_wrap').toggleClass('hidden', !receivingRefUrl);
        if (receivingRefUrl) jQuery('#receiving_ref_gambar_img').attr('src', receivingRefUrl);
        jQuery('#receiving-quantity').text(numberFormat(RECEIVING_STATE.currentQuantity, 0, ',', '.'));
        jQuery('#receiving_table_body').html('<tr><td colspan="6" class="tbl-empty">Memuat data...</td></tr>');
        // Item History = sudah di-ACC -> tombol "+ Tambah Penerimaan" disembunyikan.
        jQuery('#btn-receiving-add').toggleClass('hidden', readOnly);

        app.popup.open('#popup-partner-receiving');
        loadReceivingData(partnerId);
    }

    function loadReceivingData(partnerId) {
        jQuery.ajax({
            url: `${APP_CONFIG.API_BASE_URL}/partner/delivery`, method: 'POST', contentType: 'application/json',
            data: JSON.stringify({ id_partner_transaksi: partnerId }),
            success(res) {
                if (partnerId !== RECEIVING_STATE.currentPartnerTransaksiId) return;
                if (res.success && res.data) {
                    RECEIVING_STATE.receivingList = res.data.deliveries || [];
                    renderReceivingTable();
                    jQuery('#receiving_count').text(res.total_deliveries || RECEIVING_STATE.receivingList.length);
                } else {
                    RECEIVING_STATE.receivingList = [];
                    renderReceivingTable();
                    jQuery('#receiving_count').text(0);
                }
            },
            error(xhr) {
                if (partnerId !== RECEIVING_STATE.currentPartnerTransaksiId) return;
                RECEIVING_STATE.receivingList = [];
                renderReceivingTable();
                if (xhr.status !== 404) app.dialog.alert('Gagal memuat data penerimaan');
            },
        });
    }

    function returButtonHtml(item) {
        const jumlahRetur = parseInt(item.jumlah_retur) || 0;
        const adaRetur = jumlahRetur > 0 || (item.id_retur !== undefined && item.id_retur !== null);

        if (!adaRetur) {
            return `<a href="#" class="btn-retur-input ${BTN_BASE} ${BTN_DEFAULT}" data-id="${item.id}" data-diterima="${item.jumlah_diterima || 0}" data-retur-aktif="0">RETUR</a>`;
        }
        const statusRetur = (item.status_retur || item.status || 'BELUM').toUpperCase();
        if (statusRetur === 'SELESAI') {
            return `<a href="#" class="btn-retur-detail ${BTN_BASE} ${BTN_INFO}" data-id="${item.id}">RETUR</a>`;
        }
        return `<a href="#" class="btn-retur-penerimaan ${BTN_BASE} ${BTN_SUCCESS}" data-id="${item.id}">RETUR</a>`;
    }

    function renderReceivingTable() {
        const list = RECEIVING_STATE.receivingList;
        if (!list.length) {
            jQuery('#receiving_table_body').html('<tr><td colspan="6" class="tbl-empty">Belum ada data penerimaan</td></tr>');
            return;
        }
        const totalReceived = list.reduce((sum, r) => sum + (parseInt(r.jumlah_diterima) || 0), 0);
        const remaining = RECEIVING_STATE.currentQuantity - totalReceived;

        jQuery('#receiving_table_body').html(list.map((item, i) => `
      <tr>
        <td class="td-center whitespace-nowrap">${i + 1}</td>
        <td class="td-center whitespace-nowrap">${item.tanggal_diterima ? formatDateShort(item.tanggal_diterima) : '-'}</td>
        <td class="td-center font-bold whitespace-nowrap" style="color:var(--color-success);">${numberFormat(item.jumlah_diterima || 0, 0, ',', '.')}</td>
        <td class="td-center font-bold whitespace-nowrap" style="color:${item.jumlah_retur > 0 ? 'var(--color-danger)' : '#999'};">${numberFormat(item.jumlah_retur || 0, 0, ',', '.')}</td>
        <td class="td-center whitespace-nowrap">${numberFormat(item.jumlah_belum_diterima ?? remaining, 0, ',', '.')}</td>
        <td class="td-left whitespace-nowrap">
          <a href="#" class="btn-bukti-penerimaan ${BTN_BASE} ${BTN_INFO} mr-1.5" data-id="${item.id}">Bukti</a>
          ${returButtonHtml(item)}
        </td>
      </tr>
    `).join(''));
    }

    jQuery('#btn-receiving-add').on('click', addReceivingRow);
    jQuery('#receiving_table_body').on('click', '.btn-bukti-penerimaan', function (e) {
        e.preventDefault(); openBuktiPenerimaanViewer(jQuery(this).data('id'));
    });
    jQuery('#receiving_table_body').on('click', '.btn-retur-input', function (e) {
        e.preventDefault();
        openReturModal(jQuery(this).data('id'), jQuery(this).data('diterima'), jQuery(this).data('retur-aktif'));
    });
    jQuery('#receiving_table_body').on('click', '.btn-retur-penerimaan', function (e) {
        e.preventDefault(); openPenerimaanReturModal(jQuery(this).data('id'));
    });
    jQuery('#receiving_table_body').on('click', '.btn-retur-detail', function (e) {
        e.preventDefault(); openReturDetail(jQuery(this).data('id'));
    });

    function addReceivingRow() {
        const totalReceived = RECEIVING_STATE.receivingList.reduce((sum, r) => sum + (parseInt(r.jumlah_diterima) || 0), 0);
        const remaining = RECEIVING_STATE.currentQuantity - totalReceived;
        if (remaining <= 0) { app.dialog.alert('Seluruh pesanan sudah diterima.'); return; }

        app.dialog.confirm(
            `Sisa yang belum diterima: ${numberFormat(remaining, 0, ',', '.')} pcs. Lanjutkan input penerimaan baru?`,
            'Tambah Penerimaan',
            () => openAddReceivingForm(remaining)
        );
    }

    // Form tambah dibuat sebagai prompt sederhana (tanggal + jumlah) lalu
    // lanjut ke popup upload -- versi asli pakai baris tabel inline-editable;
    // di sini disederhanakan jadi 2 langkah (dialog konfirmasi dgn 2 input
    // tidak didukung app-shim kita, jadi pakai form kecil di popup upload).
    function openAddReceivingForm(remaining) {
        RECEIVING_STATE.tempReceivingData = { remaining };
        jQuery('#upload_tanggal_display').text(formatDateShort(new Date()));
        jQuery('#upload_jumlah_display').text('- (isi di bawah)');
        jQuery('#upload_penerima_display').text(localStorage.getItem('username') || '-');
        clearUploadPhotos();

        // Foto referensi produk (SPK) -- kroscek dobel sebelum input jumlah diterima.
        const refUrl = fotoReferensiUrl(RECEIVING_STATE.currentGambar);
        jQuery('#ref_gambar_wrap').toggleClass('hidden', !refUrl);
        if (refUrl) jQuery('#ref_gambar_img').attr('src', refUrl);

        // Sisipkan input tanggal & jumlah di atas tombol submit (dibuat sekali).
        if (!jQuery('#input_tanggal_terima_new').length) {
            jQuery(`
        <div class="space-y-2.5 mb-1">
          <div>
            <label class="mat-label">TANGGAL DITERIMA</label>
            <input id="input_tanggal_terima_new" type="date" class="mat-input">
          </div>
          <div>
            <label class="mat-label">JUMLAH DITERIMA (maks ${numberFormat(remaining, 0, ',', '.')})</label>
            <input id="input_jumlah_terima_new" type="text" inputmode="numeric" class="mat-input" placeholder="0" oninput="this.value=this.value.replace(/\\D/g,'')">
          </div>
        </div>
      `).insertBefore(jQuery('#preview_bukti_penerimaan_empty').closest('div').parent());
        }
        jQuery('#input_tanggal_terima_new').val(new Date().toISOString().split('T')[0]);
        jQuery('#input_jumlah_terima_new').val('');

        app.popup.open('#popup-partner-upload-penerimaan');
    }

    function clearUploadPhotos() {
        uploadPhoto.bukti = null; uploadPhoto.dokumen = null;
        jQuery('#input_bukti_penerimaan, #input_bukti_dokumen_penerimaan').val('');
        jQuery('#preview_bukti_penerimaan_area, #preview_bukti_dokumen_area').addClass('hidden');
        jQuery('#preview_bukti_penerimaan_empty, #preview_bukti_dokumen_empty').removeClass('hidden');
    }

    jQuery('#ref_gambar_img, #receiving_ref_gambar_img').on('click', function () {
        const src = jQuery(this).attr('src');
        if (src) app.photoBrowser.create({ photos: [src] }).open();
    });
    jQuery('#input_bukti_penerimaan').on('change', function () {
        if (!this.files[0]) return;
        uploadPhoto.bukti = this.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            jQuery('#preview_bukti_penerimaan_img').attr('src', e.target.result);
            jQuery('#preview_bukti_penerimaan_area').removeClass('hidden');
            jQuery('#preview_bukti_penerimaan_empty').addClass('hidden');
        };
        reader.readAsDataURL(uploadPhoto.bukti);
    });
    jQuery('#btn-clear-bukti-penerimaan').on('click', () => {
        uploadPhoto.bukti = null; jQuery('#input_bukti_penerimaan').val('');
        jQuery('#preview_bukti_penerimaan_area').addClass('hidden'); jQuery('#preview_bukti_penerimaan_empty').removeClass('hidden');
    });
    jQuery('#input_bukti_dokumen_penerimaan').on('change', function () {
        if (!this.files[0]) return;
        uploadPhoto.dokumen = this.files[0];
        jQuery('#preview_bukti_dokumen_name').text(uploadPhoto.dokumen.name);
        jQuery('#preview_bukti_dokumen_area').removeClass('hidden');
        jQuery('#preview_bukti_dokumen_empty').addClass('hidden');
    });
    jQuery('#btn-clear-bukti-dokumen').on('click', () => {
        uploadPhoto.dokumen = null; jQuery('#input_bukti_dokumen_penerimaan').val('');
        jQuery('#preview_bukti_dokumen_area').addClass('hidden'); jQuery('#preview_bukti_dokumen_empty').removeClass('hidden');
    });

    jQuery('#btn_submit_penerimaan').on('click', submitPenerimaanWithFiles);

    function submitPenerimaanWithFiles() {
        const tanggal = jQuery('#input_tanggal_terima_new').val();
        const jumlah = parseInt(jQuery('#input_jumlah_terima_new').val()) || 0;
        const remaining = (RECEIVING_STATE.tempReceivingData && RECEIVING_STATE.tempReceivingData.remaining) || 0;

        if (!tanggal) { app.dialog.alert('Tanggal diterima wajib diisi'); return; }
        if (jumlah <= 0) { app.dialog.alert('Jumlah diterima harus lebih dari 0'); return; }
        if (jumlah > remaining) { app.dialog.alert(`Jumlah tidak boleh lebih dari sisa (${numberFormat(remaining, 0, ',', '.')} pcs)`); return; }

        const fd = new FormData();
        fd.append('id_partner_transaksi', RECEIVING_STATE.currentPartnerTransaksiId);
        fd.append('tanggal_diterima', tanggal);
        fd.append('jumlah_diterima', jumlah);
        fd.append('jumlah_belum_diterima', remaining - jumlah);
        fd.append('nama_penerima', localStorage.getItem('username') || '');
        if (uploadPhoto.bukti) fd.append('bukti_penerimaan', uploadPhoto.bukti);
        if (uploadPhoto.dokumen) fd.append('bukti_dokumen_penerimaan', uploadPhoto.dokumen);

        jQuery('#btn_submit_penerimaan').prop('disabled', true).text('Menyimpan...');
        jQuery.ajax({
            url: `${APP_CONFIG.API_BASE_URL}/partner/delivery/add-delivery`, method: 'POST', data: fd, processData: false, contentType: false,
            success(res) {
                jQuery('#btn_submit_penerimaan').prop('disabled', false).text('SIMPAN');
                if (res.success) {
                    app.dialog.alert('Penerimaan berhasil ditambahkan');
                    app.popup.close('#popup-partner-upload-penerimaan');
                    loadReceivingData(RECEIVING_STATE.currentPartnerTransaksiId);
                    fetchPartnerData();
                } else {
                    app.dialog.alert('Gagal: ' + (res.message || ''));
                }
            },
            error(xhr) {
                jQuery('#btn_submit_penerimaan').prop('disabled', false).text('SIMPAN');
                const res = xhr.responseJSON;
                app.dialog.alert('Gagal: ' + ((res && res.message) || 'Terjadi kesalahan'));
            },
        });
    }

    // ── Bukti Penerimaan (view-only) ─────────────────────────
    function openBuktiPenerimaanViewer(id) {
        const item = RECEIVING_STATE.receivingList.find((r) => r.id == id);
        if (!item) return;
        const photos = [item.bukti_penerimaan_url, item.bukti_dokumen_penerimaan_url].filter(Boolean);
        if (!photos.length) { app.dialog.alert('Belum ada foto bukti untuk penerimaan ini'); return; }
        app.photoBrowser.create({ photos }).open();
    }

    // ── Retur (input barang rusak/tidak sesuai) ──────────────
    function openReturModal(idDetailPengiriman, jumlahDiterima, jumlahReturAktif) {
        RETUR_STATE.idDetailPengiriman = idDetailPengiriman;
        RETUR_STATE.jumlahDiterima = parseInt(jumlahDiterima) || 0;
        RETUR_STATE.jumlahReturAktif = parseInt(jumlahReturAktif) || 0;
        RETUR_STATE.maxRetur = RETUR_STATE.jumlahDiterima - RETUR_STATE.jumlahReturAktif;
        RETUR_STATE.photoFile = null;

        jQuery('#retur-partner-name').text(RECEIVING_STATE.currentPartnerName);
        jQuery('#retur-spk-code').text(RECEIVING_STATE.currentSpkCode);
        jQuery('#retur-jumlah-diterima').text(numberFormat(RETUR_STATE.jumlahDiterima, 0, ',', '.') + ' pcs');
        jQuery('#input_jumlah_retur').val('');
        jQuery('#input_alasan_retur').val('LAINNYA');
        jQuery('#input_keterangan_retur').val('');
        jQuery('#input_foto_bukti_retur').val('');
        jQuery('#foto_bukti_retur_area').addClass('hidden');
        jQuery('#foto_bukti_retur_empty').removeClass('hidden');

        app.popup.open('#popup-partner-retur');
    }

    jQuery('#input_foto_bukti_retur').on('change', function () {
        if (!this.files[0]) return;
        RETUR_STATE.photoFile = this.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            jQuery('#foto_bukti_retur_preview').attr('src', e.target.result);
            jQuery('#foto_bukti_retur_area').removeClass('hidden');
            jQuery('#foto_bukti_retur_empty').addClass('hidden');
        };
        reader.readAsDataURL(RETUR_STATE.photoFile);
    });
    jQuery('#btn-clear-foto-retur').on('click', () => {
        RETUR_STATE.photoFile = null; jQuery('#input_foto_bukti_retur').val('');
        jQuery('#foto_bukti_retur_area').addClass('hidden'); jQuery('#foto_bukti_retur_empty').removeClass('hidden');
    });
    jQuery('#btn_submit_retur').on('click', submitRetur);

    function submitRetur() {
        const jumlah = parseInt(jQuery('#input_jumlah_retur').val()) || 0;
        const alasan = jQuery('#input_alasan_retur').val();
        const keterangan = jQuery('#input_keterangan_retur').val().trim();

        if (jumlah <= 0) { app.dialog.alert('Jumlah retur harus lebih dari 0'); return; }
        if (jumlah > RETUR_STATE.maxRetur) { app.dialog.alert(`Jumlah retur tidak boleh lebih dari sisa (${numberFormat(RETUR_STATE.maxRetur, 0, ',', '.')} pcs)`); return; }

        const fd = new FormData();
        fd.append('id_detail_pengiriman', RETUR_STATE.idDetailPengiriman);
        fd.append('tanggal_retur', new Date().toISOString().split('T')[0]);
        fd.append('jumlah_retur', jumlah);
        fd.append('alasan_retur', alasan);
        fd.append('keterangan', keterangan);
        fd.append('username', localStorage.getItem('username') || '');
        if (RETUR_STATE.photoFile) fd.append('foto_bukti_retur', RETUR_STATE.photoFile);

        jQuery('#btn_submit_retur').prop('disabled', true).text('Menyimpan...');
        jQuery.ajax({
            url: `${APP_CONFIG.API_BASE_URL}/partner/retur/input-retur`, method: 'POST', data: fd, processData: false, contentType: false,
            success(res) {
                jQuery('#btn_submit_retur').prop('disabled', false).text('SIMPAN RETUR');
                if (res.status) {
                    app.dialog.alert('Retur berhasil disimpan');
                    app.popup.close('#popup-partner-retur');
                    loadReceivingData(RECEIVING_STATE.currentPartnerTransaksiId);
                } else {
                    app.dialog.alert('Gagal: ' + (res.message || ''));
                }
            },
            error(xhr) {
                jQuery('#btn_submit_retur').prop('disabled', false).text('SIMPAN RETUR');
                const res = xhr.responseJSON;
                app.dialog.alert('Gagal: ' + ((res && res.message) || 'Terjadi kesalahan'));
            },
        });
    }

    // ── Penerimaan Retur (barang pengganti dari partner diterima) ────
    function openPenerimaanReturModal(idDetailPengiriman) {
        const item = RECEIVING_STATE.receivingList.find((r) => r.id == idDetailPengiriman);
        if (!item || !(parseInt(item.jumlah_retur) > 0)) { app.dialog.alert('Belum ada data retur untuk item ini'); return; }

        jQuery.ajax({
            url: `${APP_CONFIG.API_BASE_URL}/partner/retur/get-retur-by-pengiriman/${idDetailPengiriman}`, method: 'GET',
            beforeSend() { app.dialog.preloader('Memuat data retur...'); },
            success(res) {
                app.dialog.close();
                if (!res.status || !res.data || !res.data.length) { app.dialog.alert('Data retur tidak ditemukan'); return; }
                const returData = res.data.find((r) => r.status === 'PROSES');
                if (!returData) { app.dialog.alert('Tidak ada retur berstatus PROSES'); return; }

                PENERIMAAN_RETUR_STATE.idRetur = returData.id_retur;
                PENERIMAAN_RETUR_STATE.jumlahRetur = parseInt(returData.jumlah_retur) || 0;
                PENERIMAAN_RETUR_STATE.jumlahSudahDiterima = parseInt(returData.jumlah_diterima) || 0;
                PENERIMAAN_RETUR_STATE.maxPenerimaan = PENERIMAAN_RETUR_STATE.jumlahRetur - PENERIMAAN_RETUR_STATE.jumlahSudahDiterima;
                PENERIMAAN_RETUR_STATE.photoFile = null;

                jQuery('#penerimaan_retur_partner_name').text(RECEIVING_STATE.currentPartnerName);
                jQuery('#penerimaan_retur_spk_code').text(RECEIVING_STATE.currentSpkCode);
                jQuery('#penerimaan_retur_jumlah_retur').text(numberFormat(PENERIMAAN_RETUR_STATE.jumlahRetur, 0, ',', '.') + ' pcs');
                jQuery('#penerimaan_retur_max_label').text(`(maks: ${numberFormat(PENERIMAAN_RETUR_STATE.maxPenerimaan, 0, ',', '.')})`);
                jQuery('#input_tanggal_penerimaan_retur').val(new Date().toISOString().split('T')[0]);
                jQuery('#input_jumlah_penerimaan_retur').val('');
                jQuery('#input_foto_bukti_terima_retur').val('');
                jQuery('#foto_bukti_terima_retur_area').addClass('hidden');
                jQuery('#foto_bukti_terima_retur_empty').removeClass('hidden');

                app.popup.open('#popup-partner-penerimaan-retur');
            },
            error() { app.dialog.close(); app.dialog.alert('Gagal memuat data retur'); },
        });
    }

    jQuery('#input_foto_bukti_terima_retur').on('change', function () {
        if (!this.files[0]) return;
        PENERIMAAN_RETUR_STATE.photoFile = this.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            jQuery('#foto_bukti_terima_retur_preview').attr('src', e.target.result);
            jQuery('#foto_bukti_terima_retur_area').removeClass('hidden');
            jQuery('#foto_bukti_terima_retur_empty').addClass('hidden');
        };
        reader.readAsDataURL(PENERIMAAN_RETUR_STATE.photoFile);
    });
    jQuery('#btn-clear-foto-terima-retur').on('click', () => {
        PENERIMAAN_RETUR_STATE.photoFile = null; jQuery('#input_foto_bukti_terima_retur').val('');
        jQuery('#foto_bukti_terima_retur_area').addClass('hidden'); jQuery('#foto_bukti_terima_retur_empty').removeClass('hidden');
    });
    jQuery('#btn_submit_penerimaan_retur').on('click', submitPenerimaanRetur);

    function submitPenerimaanRetur() {
        const tanggal = jQuery('#input_tanggal_penerimaan_retur').val();
        const jumlah = parseInt(jQuery('#input_jumlah_penerimaan_retur').val()) || 0;

        if (!tanggal) { app.dialog.alert('Tanggal diterima wajib diisi'); return; }
        if (jumlah <= 0) { app.dialog.alert('Jumlah diterima harus lebih dari 0'); return; }
        if (jumlah > PENERIMAAN_RETUR_STATE.maxPenerimaan) { app.dialog.alert(`Jumlah tidak boleh lebih dari sisa (${numberFormat(PENERIMAAN_RETUR_STATE.maxPenerimaan, 0, ',', '.')} pcs)`); return; }

        const fd = new FormData();
        fd.append('id_retur', PENERIMAAN_RETUR_STATE.idRetur);
        fd.append('tanggal_diterima', tanggal);
        fd.append('jumlah_diterima', jumlah);
        fd.append('username', localStorage.getItem('username') || '');
        if (PENERIMAAN_RETUR_STATE.photoFile) fd.append('foto_bukti_terima_retur', PENERIMAAN_RETUR_STATE.photoFile);

        jQuery('#btn_submit_penerimaan_retur').prop('disabled', true).text('Menyimpan...');
        jQuery.ajax({
            url: `${APP_CONFIG.API_BASE_URL}/partner/retur/input-penerimaan-retur`, method: 'POST', data: fd, processData: false, contentType: false,
            success(res) {
                jQuery('#btn_submit_penerimaan_retur').prop('disabled', false).text('SIMPAN');
                if (res.status) {
                    app.dialog.alert('Penerimaan retur berhasil disimpan');
                    app.popup.close('#popup-partner-penerimaan-retur');
                    loadReceivingData(RECEIVING_STATE.currentPartnerTransaksiId);
                } else {
                    app.dialog.alert('Gagal: ' + (res.message || ''));
                }
            },
            error(xhr) {
                jQuery('#btn_submit_penerimaan_retur').prop('disabled', false).text('SIMPAN');
                const res = xhr.responseJSON;
                app.dialog.alert('Gagal: ' + ((res && res.message) || 'Terjadi kesalahan'));
            },
        });
    }

    // ── Detail Retur (read-only, status SELESAI) ─────────────
    function openReturDetail(id) {
        const item = RECEIVING_STATE.receivingList.find((r) => r.id == id);
        if (!item) return;

        jQuery('#retur_detail_body').html(`
      <div class="flex justify-between"><span class="text-ink-secondary">Tanggal Retur</span><span class="font-semibold">${item.tanggal_retur ? formatDateShort(item.tanggal_retur) : '-'}</span></div>
      <div class="flex justify-between"><span class="text-ink-secondary">Jumlah Retur</span><span class="font-semibold">${numberFormat(item.jumlah_retur || 0, 0, ',', '.')} pcs</span></div>
      <div class="flex justify-between"><span class="text-ink-secondary">Keterangan</span><span class="font-semibold">${escHtml(item.keterangan_retur || '-')}</span></div>
      ${item.foto_bukti_retur_url ? `<img src="${item.foto_bukti_retur_url}" class="w-full rounded-md border border-ink-faint mt-2" />` : ''}
      ${item.foto_bukti_terima_retur_url ? `<img src="${item.foto_bukti_terima_retur_url}" class="w-full rounded-md border border-ink-faint mt-2" />` : ''}
    `);
        app.popup.open('#popup-partner-retur-detail');
    }

    fetchPartnerData();

    return () => { };
}