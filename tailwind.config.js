/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,html}',
  ],
  theme: {
    extend: {
      // Warna primary diganti hijau (2026-08-21, sebelumnya orange) supaya sama dengan
      // tema brand ekspedisi-apk (lihat tailwind.config.js di sana, warna brand.600/700).
      colors: {
        primary: {
          DEFAULT: '#16A34A',
          light: '#4ADE80',
        },
        danger: '#dc2626',
        warning: '#d97706',
        success: '#16a34a',
        info: '#2563eb',
        // surface/ink disamakan ke palet ekspedisi-apk (2026-08-21): surface.base
        // = nilai persis `paper` di sana, ink.* pindah dari skala gray ke slate
        // (skala netral ekspedisi-apk), ink.primary = nilai persis `ink.DEFAULT`
        // ekspedisi. Lihat catatan yang sama di src/styles/main.css :root.
        surface: {
          base: '#f5f7fa',
          DEFAULT: '#ffffff',
          raised: '#f8fafc',
          overlay: '#e2e8f0',
        },
        ink: {
          primary: '#0b1220',
          secondary: '#475569',
          muted: '#94a3b8',
          faint: '#cbd5e1',
        },
      },
      borderRadius: {
        sm: '5px',
        md: '8px',
        lg: '12px',
      },
      fontFamily: {
        heading: ['"Exo 2"', 'sans-serif'],
        body: ['Barlow', 'sans-serif'],
      },
      // shadow-card dipakai topbar (shell.js), disamakan dgn ekspedisi-apk
      // (2026-08-22, lihat boxShadow.card di tailwind.config.js sana) --
      // shadow di-tint warna ink (bukan black polos).
      boxShadow: {
        card: '0 1px 2px 0 rgba(11,18,32,0.06), 0 1px 3px 0 rgba(11,18,32,0.08)',
      },
    },
  },
  plugins: [],
};
