import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.savvypiggy.app',
  appName: 'SavvyPiggy',
  webDir: 'dist',
  android: {
    // The dark green shell shows while the web layer boots, so the app never
    // flashes white on launch.
    backgroundColor: '#0A0F0D',
    // targetSdk 36 is edge-to-edge, so the WebView draws under the system bars.
    // index.html already sets viewport-fit=cover and every screen pads itself
    // with the safe-pt / safe-pb env(safe-area-inset-*) classes.
  },
  plugins: {
    FirebaseAuthentication: {
      // Native Google sign-in hands us an ID token, but the Firebase *JS* SDK
      // stays the single source of truth — Firestore reads its auth state.
      skipNativeAuth: true,
      providers: ['google.com'],
    },
    LocalNotifications: {
      // A flat silhouette; the launcher icon would render as a white blob.
      smallIcon: 'ic_stat_savvypiggy',
      iconColor: '#4ADE80',
    },
  },
};

export default config;
