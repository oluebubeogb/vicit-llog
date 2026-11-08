import { Logger } from '@nestjs/common';
import type { App } from 'firebase-admin/app';

/**
 * Firebase Cloud Messaging (web push) sender.
 *
 * Env (backend):
 *  - ENABLE_PUSH=true                 turn sending on
 *  - FIREBASE_SERVICE_ACCOUNT_JSON    full service-account JSON (single line). Never commit it.
 *
 * If push is disabled or the service account is missing/invalid we log once and skip —
 * the in-app notification still works.
 */
const logger = new Logger('PushProvider');

let app: App | null = null;
let initTried = false;
let initError: string | null = null;

function truthy(v?: string) {
  return ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
}

function parseServiceAccount(): any | null {
  let raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  // Tolerate values wrapped in quotes by env UIs, or base64-encoded JSON.
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"') && !raw.startsWith('"{'))) {
    raw = raw.slice(1, -1);
  }
  if (!raw.startsWith('{')) {
    try {
      raw = Buffer.from(raw, 'base64').toString('utf8');
    } catch {
      /* not base64 */
    }
  }
  try {
    const sa = JSON.parse(raw);
    if (typeof sa.private_key === 'string') sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    if (!sa.project_id || !sa.client_email || !sa.private_key) {
      initError = 'FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id / client_email / private_key';
      return null;
    }
    return sa;
  } catch {
    initError = 'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON';
    return null;
  }
}

function getApp(): App | null {
  if (app) return app;
  if (initTried) return null;
  initTried = true;
  const sa = parseServiceAccount();
  if (!sa) {
    if (!initError) initError = 'FIREBASE_SERVICE_ACCOUNT_JSON not set';
    logger.warn(`Push disabled: ${initError}`);
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const existing = getApps().find((a: App) => a.name === 'vicit-push');
    app =
      existing ||
      initializeApp({ credential: cert(sa), projectId: sa.project_id }, 'vicit-push');
    logger.log(`Firebase push ready (project ${sa.project_id})`);
    return app;
  } catch (e: any) {
    initError = e?.message || String(e);
    logger.warn(`Push disabled: Firebase init failed: ${initError}`);
    return null;
  }
}

export function pushEnabledFlag() {
  return truthy(process.env.ENABLE_PUSH);
}

/** True when the server can actually send (ENABLE_PUSH and a valid service account). */
export function isPushReady() {
  return pushEnabledFlag() && !!getApp();
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export type PushResult = {
  ok: boolean;
  sent: number;
  failed: number;
  invalidTokens: string[];
  error?: string;
};

export async function sendPush(
  tokens: string[],
  msg: { title: string; body: string; data?: Record<string, string>; link?: string; icon?: string },
): Promise<PushResult> {
  const result: PushResult = { ok: false, sent: 0, failed: 0, invalidTokens: [] };
  if (!tokens.length) return { ...result, error: 'No registered devices' };
  const a = getApp();
  if (!a) return { ...result, error: initError || 'Push not configured' };

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getMessaging } = require('firebase-admin/messaging');
  const messaging = getMessaging(a);

  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(msg.data || {})) if (v != null) data[k] = String(v);
  data.title = msg.title;
  data.body = msg.body;

  const link = msg.link || data.url || '/notifications';
  const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const absLink = /^https:\/\//i.test(link) ? link : /^https:\/\//i.test(base) ? `${base}${link.startsWith('/') ? '' : '/'}${link}` : undefined;

  try {
    // FCM caps multicast at 500 tokens
    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500);
      const res = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title: msg.title, body: msg.body },
        data,
        webpush: {
          headers: { Urgency: 'high', TTL: String(60 * 60 * 24) },
          notification: {
            title: msg.title,
            body: msg.body,
            icon: msg.icon || '/icon-192.png',
            badge: '/icon-192.png',
            tag: data.notificationId || undefined,
          },
          ...(absLink ? { fcmOptions: { link: absLink } } : {}),
        },
      });
      result.sent += res.successCount;
      result.failed += res.failureCount;
      res.responses.forEach((r: any, idx: number) => {
        if (!r.success && r.error && INVALID_TOKEN_CODES.has(r.error.code)) {
          result.invalidTokens.push(chunk[idx]);
        } else if (!r.success && r.error && !result.error) {
          result.error = `${r.error.code}: ${r.error.message}`;
        }
      });
    }
    result.ok = result.sent > 0;
    return result;
  } catch (e: any) {
    return { ...result, error: e?.message || String(e) };
  }
}
