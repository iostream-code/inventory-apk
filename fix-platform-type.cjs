// Cordova platform files (platforms/*/cordova/*.js, mis. Api.js) SELALU
// CommonJS (pakai `module.exports`), tapi package.json root project ini
// sengaja "type": "module" (dipakai src/js/* & vite/postcss/tailwind config).
// Tanpa file ini, Node ikut nganggap file2 di dalam platforms/ sbg ES module
// juga (krn Node cari package.json terdekat ke ATAS dari lokasi file, dan
// platforms/<platform>/ tidak punya package.json sendiri) -> error
// "ReferenceError: module is not defined in ES module scope" saat
// `cordova build/prepare/run android` (gagal dgn pesan generik "Could not
// load API for android project .../cordova/Api.js").
//
// platforms/ di-gitignore & di-generate ulang tiap `cordova platform add`,
// jadi fix ini WAJIB dijalankan ulang tiap kali platform diregenerasi --
// makanya dipasang otomatis di depan tiap npm script yg menyentuh cordova
// (lihat package.json: cordova:prepare / cordova:android / cordova:ios).
// Aman dijalankan berkali-kali, dan aman kalau folder platforms/<x> belum ada.

const fs = require('fs');
const path = require('path');

const platformsDir = path.join(__dirname, 'platforms');

if (!fs.existsSync(platformsDir)) {
  process.exit(0);
}

for (const name of fs.readdirSync(platformsDir)) {
  const dir = path.join(platformsDir, name);
  if (!fs.statSync(dir).isDirectory()) continue;

  const pkgPath = path.join(dir, 'package.json');
  const desired = { type: 'commonjs' };

  if (fs.existsSync(pkgPath)) {
    let current;
    try {
      current = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      current = null;
    }
    if (current && current.type === 'commonjs') continue;
  }

  fs.writeFileSync(pkgPath, JSON.stringify(desired, null, 2) + '\n');
  console.log(`[fix-platform-type] ${name}/package.json -> "type": "commonjs"`);
}
