const fs = require('fs');
const path = require('path');

const buildGradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');

if (!fs.existsSync(buildGradlePath)) {
  console.log('⚠️  build.gradle not found, skipping signing config');
  process.exit(0);
}

let content = fs.readFileSync(buildGradlePath, 'utf8');

// Check if already patched with keystoreProperties
if (content.includes('keystoreProperties[')) {
  console.log('✅ Signing config already present');
  process.exit(0);
}

// Add keystore properties loader before android block (if not present)
if (!content.includes('keystorePropertiesFile')) {
  const keystoreLoader = `
// Load keystore properties for release signing
def keystorePropertiesFile = rootProject.file("../keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {`;
  content = content.replace('android {', keystoreLoader);
}

// Replace signingConfigs to add release config using keystoreProperties (no hardcoded secrets)
const oldSigningConfigs = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

const newSigningConfigs = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            storeFile keystorePropertiesFile.exists() ? rootProject.file("../" + keystoreProperties['storeFile']) : null
            storePassword keystoreProperties['storePassword'] ?: ''
            keyAlias keystoreProperties['keyAlias'] ?: ''
            keyPassword keystoreProperties['keyPassword'] ?: keystoreProperties['storePassword'] ?: ''
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
            def enablePngCrunchInRelease = findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true'
            crunchPngs enablePngCrunchInRelease.toBoolean()
        }
    }`;

// Try to replace existing signingConfigs block
if (content.includes(oldSigningConfigs)) {
  content = content.replace(oldSigningConfigs, newSigningConfigs);
} else {
  // If the structure is different, try a more flexible replacement
  const signingConfigsRegex = /signingConfigs\s*\{[\s\S]*?\n    \}/;
  const buildTypesRegex = /buildTypes\s*\{[\s\S]*?\n    \}/;

  // Remove existing buildTypes if present (we'll add it in newSigningConfigs)
  if (buildTypesRegex.test(content)) {
    content = content.replace(buildTypesRegex, '');
  }

  // Replace signingConfigs
  if (signingConfigsRegex.test(content)) {
    content = content.replace(signingConfigsRegex, newSigningConfigs);
  }
}

fs.writeFileSync(buildGradlePath, content);
console.log('✅ Restored release signing config in build.gradle (using keystore.properties)');
