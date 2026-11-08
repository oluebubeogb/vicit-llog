/**
 * Server-only: Firebase *web* config read at request time from the frontend container env,
 * so Coolify can set/rotate it without a rebuild. These values are public by design
 * (they end up in the browser); the service account lives only on the backend.
 */
export type FirebaseWebConfig = {
  configured: boolean;
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
};

const clean = (v?: string) => String(v || '').trim().replace(/^['"]|['"]$/g, '');

export function readFirebaseEnv(): FirebaseWebConfig {
  const projectId = clean(process.env.FIREBASE_PROJECT_ID);
  const cfg = {
    apiKey: clean(process.env.FIREBASE_API_KEY),
    authDomain: clean(process.env.FIREBASE_AUTH_DOMAIN) || (projectId ? `${projectId}.firebaseapp.com` : ''),
    projectId,
    storageBucket: clean(process.env.FIREBASE_STORAGE_BUCKET),
    messagingSenderId: clean(process.env.FIREBASE_MESSAGING_SENDER_ID),
    appId: clean(process.env.FIREBASE_APP_ID),
    vapidKey: clean(process.env.FIREBASE_VAPID_KEY),
  };
  const configured = !!(cfg.apiKey && cfg.projectId && cfg.messagingSenderId && cfg.appId && cfg.vapidKey);
  if (!configured) {
    return {
      configured: false,
      apiKey: '',
      authDomain: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: '',
      vapidKey: '',
    };
  }
  return { configured, ...cfg };
}
