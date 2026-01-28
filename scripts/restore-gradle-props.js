const fs = require('fs');
const path = require('path');

const gradlePropsPath = path.join(__dirname, '..', 'android', 'gradle.properties');
const backupPath = path.join(__dirname, '..', 'gradle.properties.backup');

if (fs.existsSync(backupPath)) {
  // Check if gradle.properties exists and if it's missing our custom properties
  if (fs.existsSync(gradlePropsPath)) {
    const currentContent = fs.readFileSync(gradlePropsPath, 'utf8');
    const backupContent = fs.readFileSync(backupPath, 'utf8');
    
    // If current file doesn't have our signing config, restore from backup
    if (!currentContent.includes('MYAPP_UPLOAD_STORE_FILE') || !currentContent.includes('MYAPP_UPLOAD_KEY_ALIAS')) {
      fs.copyFileSync(backupPath, gradlePropsPath);
      console.log('✅ Restored gradle.properties (signing config was missing)');
    } else {
      // Merge: keep current file but ensure our custom properties are there
      const lines = backupContent.split('\n');
      const customProps = lines.filter(line => 
        line.startsWith('MYAPP_UPLOAD_') || 
        line.startsWith('# Release signing config')
      );
      
      const currentLines = currentContent.split('\n');
      const hasCustomProps = customProps.some(prop => currentContent.includes(prop));
      
      if (!hasCustomProps && customProps.length > 0) {
        const merged = currentContent + '\n' + customProps.join('\n');
        fs.writeFileSync(gradlePropsPath, merged);
        console.log('✅ Merged custom signing config into gradle.properties');
      } else {
        console.log('✅ gradle.properties already has signing config');
      }
    }
  } else {
    // File was deleted, restore from backup
    fs.copyFileSync(backupPath, gradlePropsPath);
    console.log('✅ Restored gradle.properties (file was deleted)');
  }
  
  // Clean up backup
  fs.unlinkSync(backupPath);
} else {
  console.log('⚠️  No backup found, skipping restore');
}
