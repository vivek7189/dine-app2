const fs = require('fs');
const path = require('path');

const buildGradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');

if (fs.existsSync(buildGradlePath)) {
  let content = fs.readFileSync(buildGradlePath, 'utf8');
  
  // Target version for this release
  const TARGET_VERSION_CODE = 8;
  const TARGET_VERSION_NAME = '1.1.2';
  
  // Check if versionCode is already set to target or higher
  const versionCodeMatch = content.match(/versionCode\s+(\d+)/);
  const currentVersionCode = versionCodeMatch ? parseInt(versionCodeMatch[1]) : 1;
  
  // Set to target if it's less than target (to avoid conflicts with previously uploaded versions)
  if (currentVersionCode < TARGET_VERSION_CODE) {
    content = content.replace(/versionCode\s+\d+/, `versionCode ${TARGET_VERSION_CODE}`);
    fs.writeFileSync(buildGradlePath, content);
    console.log(`✅ Updated versionCode from ${currentVersionCode} to ${TARGET_VERSION_CODE}`);
  } else {
    console.log(`✅ versionCode is already ${currentVersionCode} (good)`);
  }
  
  // Ensure versionName is set to target version
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
