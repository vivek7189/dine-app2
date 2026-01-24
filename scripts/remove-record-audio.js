const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (fs.existsSync(manifestPath)) {
  let content = fs.readFileSync(manifestPath, 'utf8');
  
  // Remove RECORD_AUDIO permission line
  const lines = content.split('\n');
  const filteredLines = lines.filter(line => 
    !line.includes('android.permission.RECORD_AUDIO')
  );
  
  const newContent = filteredLines.join('\n');
  fs.writeFileSync(manifestPath, newContent);
  console.log('✅ Removed RECORD_AUDIO permission from AndroidManifest.xml');
} else {
  console.log('⚠️  AndroidManifest.xml not found');
}
