import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stitchnship.app',
  appName: 'Stitch&Ship',
  webDir: 'www',
  plugins: {
    LiveUpdate: {
      appId: '68c05963-3357-4665-ae0a-5890c7d4a842',
      autoDeleteBundles: true,
      readyTimeout: 10000,
    },
  }
};

export default config;
