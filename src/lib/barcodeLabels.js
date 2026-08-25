// Cetak Barcode (2026-08-24) -- generate lembar label barcode (PDF, A4) utk
// material terpilih di halaman Master Barang. Nilai barcode SUDAH ada per
// material (di-generate backend, format `8991001`+urutan -- BUKAN EAN-13
// valid krn tidak py check digit & panjangnya bisa lebih dari 12 digit kalau
// urutannya sudah besar), jadi dirender sbg simbologi CODE128 (terima string
// sepanjang apa pun, tanpa checksum wajib) -- lihat
// MaterialController::generateBarcode() (backend-migrasi & backend-production
// keduanya pakai pola yang sama).
//
// Legacy Framework7 (sebelum migrasi ke app ini) pernah pakai JsBarcode +
// cordova-pdf-generator/socialsharing (plugin native, sudah tidak ada). Di
// sini diganti jsPDF (client-side murni) + savePdf() (lihat pdfSave.js) --
// pola yang sama sudah terbukti jalan di purchase-finance-apk utk PDF PO/
// Retur.
import jsPDF from 'jspdf';
import JsBarcode from 'jsbarcode';
import { savePdf } from './pdfSave.js';

// Grid label 3 kolom x 7 baris (21 label/lembar A4) -- ukuran umum kertas
// label sticker "3x7" yang banyak dijual (~63.5x38mm/label, mirip Avery
// L7160). Kalau kertas fisik yang dipakai gudang beda ukuran, cukup ubah
// 3 konstanta di bawah ini (COLS/ROWS/PAGE_MARGIN), tidak ada tempat lain
// yang perlu disentuh.
const COLS = 3;
const ROWS = 7;
const PAGE_MARGIN = 8; // mm
const PAGE_W = 210; // A4 portrait
const PAGE_H = 297;
const CELL_W = (PAGE_W - PAGE_MARGIN * 2) / COLS;
const CELL_H = (PAGE_H - PAGE_MARGIN * 2) / ROWS;
const CELL_PAD = 3;

// Render 1 barcode ke canvas lepas (tidak perlu di-attach ke DOM -- JsBarcode
// cuma butuh 2D context) lalu ambil dataURL PNG-nya. `displayValue: true`
// bikin JsBarcode ikut menulis angka barcode-nya di bawah bar, jadi tidak
// perlu digambar manual terpisah di jsPDF.
function renderBarcodeDataUrl(value) {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
        format: 'CODE128',
        displayValue: true,
        fontSize: 16,
        height: 40,
        margin: 4,
    });
    return canvas.toDataURL('image/png');
}

function safeFilename(count) {
    const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    return `Barcode-Material-${count}item-${dateStr}.pdf`;
}

// materials: [{ id, code, name, barcode }] -- dari state.data halaman
// Material (field lain diabaikan, tidak perlu API call terpisah krn barcode
// sudah ikut di response get-materials).
export async function printBarcodeLabels(materials) {
    if (!materials || !materials.length) return;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const perPage = COLS * ROWS;

    materials.forEach((m, idx) => {
        const posInPage = idx % perPage;
        if (posInPage === 0 && idx > 0) doc.addPage();

        const col = posInPage % COLS;
        const row = Math.floor(posInPage / COLS);
        const x = PAGE_MARGIN + col * CELL_W;
        const y = PAGE_MARGIN + row * CELL_H;

        // Garis potong tipis per label.
        doc.setDrawColor(210, 210, 210);
        doc.setLineWidth(0.1);
        doc.rect(x, y, CELL_W, CELL_H);

        // Nama material (maks 2 baris, dipotong kalau kepanjangan).
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(20, 20, 20);
        const nameLines = doc.splitTextToSize(m.name || '-', CELL_W - CELL_PAD * 2).slice(0, 2);
        doc.text(nameLines, x + CELL_W / 2, y + CELL_PAD + 2.5, { align: 'center' });

        // Kode material.
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 100, 100);
        const codeY = y + CELL_PAD + 2.5 + nameLines.length * 3.2;
        doc.text(m.code || '-', x + CELL_W / 2, codeY, { align: 'center' });

        // Gambar barcode (CODE128 + angka), mengisi sisa tinggi cell.
        if (m.barcode) {
            const dataUrl = renderBarcodeDataUrl(String(m.barcode));
            const imgW = CELL_W - CELL_PAD * 2;
            const imgH = Math.max(10, y + CELL_H - CELL_PAD - (codeY + 1.5));
            doc.addImage(dataUrl, 'PNG', x + CELL_PAD, codeY + 1.5, imgW, imgH);
        } else {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(7);
            doc.setTextColor(220, 38, 38);
            doc.text('Tanpa barcode', x + CELL_W / 2, y + CELL_H / 2, { align: 'center' });
        }
    });

    await savePdf(doc, safeFilename(materials.length));
}
