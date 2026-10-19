import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stitchnship.app',
  appName: 'Stitch&Ship',
  webDir: 'www',
  plugins: {
    LiveUpdates: {
      appId: '759abf5a',
      channel: 'Production',
      autoUpdateMethod: 'background',
      maxVersions: 2
    }
  }
};

export default config;
