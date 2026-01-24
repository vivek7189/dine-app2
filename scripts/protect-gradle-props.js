const fs = require('fs');
const path = require('path');

const gradlePropsPath = path.join(__dirname, '..', 'android', 'gradle.properties');

if (fs.existsSync(gradlePropsPath)) {
  const backupPath = path.join(__dirname, '..', 'android', 'gradle.properties.backup');
  fs.copyFileSync(gradlePropsPath, backupPath);
  console.log('✅ Protected gradle.properties (backed up)');
} else {
  console.log('⚠️  gradle.properties not found, skipping backup');
}
