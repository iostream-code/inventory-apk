// bump-version.cjs -- adaptasi dari pola yang sama persis dipakai ekspedisi-apk/
// finance-apk/admin-finance-apk (lihat bump-version.cjs di ekspedisi-apk).
// CommonJS (.cjs, bukan .js) SENGAJA -- package.json app ini "type": "module",
// `require()` polos di file .js bakal gagal, .cjs override itu terlepas dari
// "type" package.json.
//
// App ini Vite (ESM), bukan Cordova <script> tag polos -- generate
// `src/lib/app-version.js` sbg ES module (`export const`, bukan `var` global)
// supaya bisa di-import biasa oleh version-check.js & login.js, ikut
// di-bundle Vite, bukan ditaruh manual di index.html.
const fs = require('fs');
const path = require('path');

function readConfigXml() {
  return fs.readFileSync(path.join(__dirname, 'config.xml'), 'utf8');
}

function writeConfigXml(content) {
  fs.writeFileSync(path.join(__dirname, 'config.xml'), content, 'utf8');
}

function parseVersion(configXml) {
  const versionMatch = configXml.match(/version="(\d+)\.(\d+)\.(\d+)"/);
  const androidCodeMatch = configXml.match(/android-versionCode="(\d+)"/);

  if (!versionMatch) {
    throw new Error('Version tidak ditemukan di config.xml');
  }

  return {
    major: parseInt(versionMatch[1], 10),
    minor: parseInt(versionMatch[2], 10),
    patch: parseInt(versionMatch[3], 10),
    androidCode: androidCodeMatch ? parseInt(androidCodeMatch[1], 10) : 0,
  };
}

function updateVersion(configXml, newVersion, newAndroidCode) {
  let updated = configXml.replace(
    /version="\d+\.\d+\.\d+"/,
    `version="${newVersion.major}.${newVersion.minor}.${newVersion.patch}"`
  );

  if (updated.includes('android-versionCode=')) {
    updated = updated.replace(/android-versionCode="\d+"/, `android-versionCode="${newAndroidCode}"`);
  } else {
    updated = updated.replace(/<widget([^>]*?)>/, `<widget$1 android-versionCode="${newAndroidCode}">`);
  }

  const versionString = `${newVersion.major}.${newVersion.minor}.${newVersion.patch}`;
  if (updated.includes('ios-CFBundleVersion=')) {
    updated = updated.replace(/ios-CFBundleVersion="[^"]+"/, `ios-CFBundleVersion="${versionString}"`);
  } else {
    updated = updated.replace(/<widget([^>]*?)>/, `<widget$1 ios-CFBundleVersion="${versionString}">`);
  }

  return updated;
}

function updatePackageJson(newVersionString) {
  const packagePath = path.join(__dirname, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = newVersionString;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
}

// Dibaca oleh version-check.js (src/lib/) -- android-versionCode (integer,
// naik 1 tiap rilis) yang dikirim ke POST /config/check-version, dibandingkan
// `>=` ke config_value_minimal (tabel `config`, config_id='VERSION_INVENTORY',
// lihat backend-production VersionController::$configIdMap). Integer dipilih
// (bukan version string) krn itu tujuannya: gampang dibandingkan, konsisten
// dgn sibling apps lain di workspace ini (finance-apk, admin-finance-apk,
// ekspedisi-apk).
function updateAppVersionJs(androidCode, versionString) {
  const outPath = path.join(__dirname, 'src', 'lib', 'app-version.js');
  const content = `// [BERKAS AUTO-GENERATE oleh bump-version.cjs -- JANGAN DIEDIT MANUAL]
// Dibaca oleh version-check.js & login.js saat app bootstrap -- dikirim ke
// POST /config/check-version supaya backend bisa bandingkan dgn
// config_value_minimal (tabel config, config_id='VERSION_INVENTORY').
export const CURRENT_APP_VERSION_CODE = ${androidCode};
export const CURRENT_APP_VERSION_STRING = '${versionString}';
`;
  fs.writeFileSync(outPath, content, 'utf8');
}

function bumpVersion(type = 'patch', customVersion = null) {
  console.log(`Memulai version bump: ${type}\n`);

  const configXml = readConfigXml();
  const currentVersion = parseVersion(configXml);

  console.log(`Versi saat ini: ${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch}`);
  console.log(`Android versionCode saat ini: ${currentVersion.androidCode}\n`);

  let newVersion = { ...currentVersion };

  if (customVersion) {
    const parts = customVersion.split('.');
    newVersion.major = parseInt(parts[0], 10);
    newVersion.minor = parseInt(parts[1], 10);
    newVersion.patch = parseInt(parts[2], 10);
  } else {
    switch (type) {
      case 'major':
        newVersion.major += 1;
        newVersion.minor = 0;
        newVersion.patch = 0;
        break;
      case 'minor':
        newVersion.minor += 1;
        newVersion.patch = 0;
        break;
      case 'patch':
      default:
        newVersion.patch += 1;
        break;
    }
  }

  const newAndroidCode = currentVersion.androidCode + 1;
  const newVersionString = `${newVersion.major}.${newVersion.minor}.${newVersion.patch}`;

  console.log(`Versi baru: ${newVersionString}`);
  console.log(`Android versionCode baru: ${newAndroidCode}\n`);

  writeConfigXml(updateVersion(configXml, newVersion, newAndroidCode));
  console.log('config.xml berhasil diupdate');

  updatePackageJson(newVersionString);
  console.log('package.json berhasil diupdate');

  updateAppVersionJs(newAndroidCode, newVersionString);
  console.log('src/lib/app-version.js berhasil diupdate\n');

  console.log(`PENTING: nilai di DB (tabel config, config_id='VERSION_INVENTORY',`);
  console.log(`  config_value_minimal) HARUS ikut di-update manual ke ${newAndroidCode} kalau rilis`);
  console.log(`  ini memang wajib dipakai (bukan cuma opsional/rekomendasi) -- script ini`);
  console.log(`  SENGAJA tidak push otomatis ke server (config table dipakai banyak app lain).`);
}

const args = process.argv.slice(2);
const type = args[0] || 'patch';

if (type.match(/^\d+\.\d+\.\d+$/)) {
  bumpVersion('custom', type);
} else {
  bumpVersion(type);
}
