/**
 * Expo config plugin — standard Android network-security-config for offline LAN use.
 *
 * Permits plain HTTP generally so a terminal can reach the on-prem local server at an
 * arbitrary private IP (http://192.168.x.x:3003 + ws://) — HTTPS on a LAN IP is
 * impractical (no CA issues certs for private IPs), which is why POS systems use HTTP
 * on the local network. Our CLOUD domains are FORCED to HTTPS so they can never be
 * downgraded. Replaces the blanket android:usesCleartextTraffic.
 *
 * Referenced from app.json plugins. Survives `expo prebuild` (unlike hand-edited native
 * files), so the rule is applied on every EAS build.
 */
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NSC_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">dineopen.com</domain>
        <domain includeSubdomains="true">vercel.app</domain>
        <domain includeSubdomains="true">run.app</domain>
        <domain includeSubdomains="true">sslip.io</domain>
        <domain includeSubdomains="true">googleapis.com</domain>
        <domain includeSubdomains="true">firebaseio.com</domain>
        <domain includeSubdomains="true">firebasedatabase.app</domain>
    </domain-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">localhost</domain>
    </domain-config>
</network-security-config>
`;

function withLanNetworkSecurity(config) {
  // 1) Write the XML resource into the generated Android project.
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const xmlDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, 'network_security_config.xml'), NSC_XML);
      return cfg;
    },
  ]);

  // 2) Point the <application> at it and drop the blanket cleartext flag (NSC governs it).
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    delete app.$['android:usesCleartextTraffic'];
    return cfg;
  });

  return config;
}

module.exports = withLanNetworkSecurity;
