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

// The new signingConfigs + buildTypes block (with release signing)
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

// Step 1: Remove ALL existing buildTypes blocks (Expo generates one that overrides ours)
// Use a greedy regex that matches buildTypes { ... } accounting for nested braces
content = content.replace(/    buildTypes\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '');

// Step 2: Replace existing signingConfigs block with our new one (includes buildTypes)
const signingConfigsRegex = /    signingConfigs\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/;
if (signingConfigsRegex.test(content)) {
  content = content.replace(signingConfigsRegex, newSigningConfigs);
} else {
  console.log('⚠️  Could not find signingConfigs block to replace');
}

// Clean up any double blank lines left from removals
content = content.replace(/\n{3,}/g, '\n\n');

fs.writeFileSync(buildGradlePath, content);
console.log('✅ Restored release signing config in build.gradle (using keystore.properties)');
