const fs = require('fs');
const path = require('path');

const buildGradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');

if (fs.existsSync(buildGradlePath)) {
  let content = fs.readFileSync(buildGradlePath, 'utf8');
  
  // Check if versionCode is already set to 5 or higher
  const versionCodeMatch = content.match(/versionCode\s+(\d+)/);
  const currentVersionCode = versionCodeMatch ? parseInt(versionCodeMatch[1]) : 1;
  
  // Set to 5 if it's less than 5 (to avoid conflicts with previously uploaded versions)
  if (currentVersionCode < 5) {
    content = content.replace(/versionCode\s+\d+/, 'versionCode 5');
    fs.writeFileSync(buildGradlePath, content);
    console.log(`✅ Updated versionCode from ${currentVersionCode} to 5`);
  } else {
    console.log(`✅ versionCode is already ${currentVersionCode} (good)`);
  }
  
  // Ensure versionName is set to 1.1.1
  const versionNameMatch = content.match(/versionName\s+"([^"]+)"/);
  const currentVersionName = versionNameMatch ? versionNameMatch[1] : '1.0.0';
  
  if (currentVersionName !== '1.1.1') {
    content = content.replace(/versionName\s+"[^"]+"/, 'versionName "1.1.1"');
    fs.writeFileSync(buildGradlePath, content);
    console.log(`✅ Updated versionName from ${currentVersionName} to 1.1.1`);
  } else {
    console.log(`✅ versionName is already 1.1.1 (good)`);
  }
} else {
  console.log('⚠️  build.gradle not found');
}
