const fs = require('fs');
const path = require('path');

const buildGradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');

if (!fs.existsSync(buildGradlePath)) {
  console.log('⚠️  build.gradle not found, skipping lint disable');
  process.exit(0);
}

let content = fs.readFileSync(buildGradlePath, 'utf8');

// Check if already patched
if (content.includes('lintOptions') || content.includes('lint {')) {
  console.log('✅ Lint config already present');
  process.exit(0);
}

// Add lintOptions inside the android block to disable lint for release builds
// This fixes react-native-screens lint crash with newer Kotlin/AGP
const lintBlock = `    lintOptions {
        checkReleaseBuilds false
        abortOnError false
    }
`;

// Insert before the closing of android block (before packagingOptions or at end)
if (content.includes('    packagingOptions {')) {
  content = content.replace('    packagingOptions {', lintBlock + '    packagingOptions {');
} else {
  // Insert before the last closing brace of android block
  const androidBlockEnd = content.lastIndexOf('}');
  content = content.slice(0, androidBlockEnd) + lintBlock + content.slice(androidBlockEnd);
}

fs.writeFileSync(buildGradlePath, content);
console.log('✅ Disabled lint for release builds (fixes react-native-screens lint crash)');
