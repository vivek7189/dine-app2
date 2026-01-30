const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '..', 'app.json');
const buildGradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');

// Read target version from app.json (source of truth)
let TARGET_VERSION_NAME = '1.1.3';
let TARGET_VERSION_CODE = 9;
if (fs.existsSync(appJsonPath)) {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  if (appJson.expo?.version) TARGET_VERSION_NAME = appJson.expo.version;
  if (appJson.expo?.android?.versionCode != null) TARGET_VERSION_CODE = appJson.expo.android.versionCode;
}

if (fs.existsSync(buildGradlePath)) {
  let content = fs.readFileSync(buildGradlePath, 'utf8');

  const versionCodeMatch = content.match(/versionCode\s+(\d+)/);
  const currentVersionCode = versionCodeMatch ? parseInt(versionCodeMatch[1]) : 1;

  if (currentVersionCode !== TARGET_VERSION_CODE) {
    content = content.replace(/versionCode\s+\d+/, `versionCode ${TARGET_VERSION_CODE}`);
    fs.writeFileSync(buildGradlePath, content);
    console.log(`✅ Updated versionCode from ${currentVersionCode} to ${TARGET_VERSION_CODE}`);
  } else {
    console.log(`✅ versionCode is already ${TARGET_VERSION_CODE} (good)`);
  }

  const versionNameMatch = content.match(/versionName\s+"([^"]+)"/);
  const currentVersionName = versionNameMatch ? versionNameMatch[1] : '1.0.0';

  if (currentVersionName !== TARGET_VERSION_NAME) {
    content = content.replace(/versionName\s+"[^"]+"/, `versionName "${TARGET_VERSION_NAME}"`);
    fs.writeFileSync(buildGradlePath, content);
    console.log(`✅ Updated versionName from ${currentVersionName} to ${TARGET_VERSION_NAME}`);
  } else {
    console.log(`✅ versionName is already ${TARGET_VERSION_NAME} (good)`);
  }
} else {
  console.log('⚠️  build.gradle not found');
}
