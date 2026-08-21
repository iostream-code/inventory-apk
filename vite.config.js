import { defineConfig } from 'vite';
import path from 'path';

// Vite build output ditulis langsung ke folder `www` yang dibaca Cordova.
// base: '' penting supaya semua asset pakai relative path (wajib untuk file:// di WebView Android/iOS).
export default defineConfig({
  root: 'src',
  base: '',
  publicDir: path.resolve(__dirname, 'public'),
  build: {
    outDir: path.resolve(__dirname, 'www'),
    emptyOutDir: true,
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    host: true, // supaya bisa diakses dari HP fisik di jaringan yang sama saat development
  },
});
