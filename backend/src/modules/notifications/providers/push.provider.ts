import { Logger } from '@nestjs/common';
import webpush = require('web-push');

/**
 * Standard Web Push (VAPID) sender for installed PWAs and desktop browsers.
 *
 * Env:
 *  - ENABLE_PUSH=false            explicitly turn sending off (default is on)
 *  - VAPID_PUBLIC_KEY             URL-safe base64 public key
 *  - VAPID_PRIVATE_KEY            URL-safe base64 private key (SECRET)
 *  - VAPID_SUBJECT                mailto: or https: contact, default mailto:support@vicit.local
 *
 * Generate a pair with: npx web-push generate-vapid-keys
 * If keys are missing and push is not explicitly disabled, an ephemeral pair is
 * used for this process only so local development still works. Subscriptions
 * created with ephemeral keys die when the process restarts.
 *
 * Legacy Firebase tokens stored before this change cannot be delivered and are
 * reported as invalid so the device re-registers with a Web Push subscription.
 */
const logger = new Logger('PushProvider');

let configured = false;
let publicKey = '';
let initError: string | null = null;

function truthyOff(v?: string) {
  return ['0', 'false', 'no', 'off'].includes(String(v || '').trim().toLowerCase());
}

export function pushEnabledFlag() {
  return !truthyOff(process.env.ENABLE_PUSH);
}

function ensureConfigured() {
  if (configured) return true;
  if (!pushEnabledFlag()) {
    initError = 'ENABLE_PUSH is off';
    return false;
  }
  let pub = (process.env.VAPID_PUBLIC_KEY || process.env.WEB_PUSH_PUBLIC_KEY || '').trim();
  let priv = (process.env.VAPID_PRIVATE_KEY || process.env.WEB_PUSH_PRIVATE_KEY || '').trim();
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    pub = keys.publicKey;
    priv = keys.privateKey;
    logger.warn(
      'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set. Using ephemeral keys for this process. Set both in production or subscriptions will not survive a restart.',
    );
  }
  const subject = (process.env.VAPID_SUBJECT || 'mailto:support@vicit.local').trim();
  try {
    webpush.setVapidDetails(subject, pub, priv);
    publicKey = pub;
    configured = true;
    initError = null;
    logger.log('Web Push ready (VAPID)');
    return true;
  } catch (e: any) {
    initError = e?.message || String(e);
    logger.warn(`Push disabled: ${initError}`);
    return false;
  }
}

export function isPushReady() {
  return ensureConfigured();
}

export function vapidPublicKey() {
  ensureConfigured();
  return publicKey;
}

export type PushResult = {
  ok: boolean;
  sent: number;
  failed: number;
  invalidTokens: string[];
  error?: string;
};

export function parseSubscription(token: string): webpush.PushSubscription | null {
  try {
    const parsed = JSON.parse(token);
    if (parsed && typeof parsed.endpoint === 'string' && parsed.keys?.p256dh && parsed.keys?.auth) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function sendPush(
  tokens: string[],
  msg: { title: string; body: string; data?: Record<string, string>; link?: string; icon?: string },
): Promise<PushResult> {
  const result: PushResult = { ok: false, sent: 0, failed: 0, invalidTokens: [] };
  if (!tokens.length) return { ...result, error: 'No registered devices' };
  if (!ensureConfigured()) return { ...result, error: initError || 'Push not configured' };

  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(msg.data || {})) if (v != null) data[k] = String(v);
  data.title = msg.title;
  data.body = msg.body;
  const link = msg.link || data.url || '/notifications';
  data.url = link;

  const payload = JSON.stringify({
    title: msg.title,
    body: msg.body,
    icon: msg.icon || '/icon-192.png',
    url: link,
    tag: data.tag || data.callId || data.notificationId || undefined,
    type: data.type || '',
    callId: data.callId || '',
    notificationId: data.notificationId || '',
  });

  await Promise.all(
    tokens.map(async (token) => {
      const sub = parseSubscription(token);
      if (!sub) {
        result.failed++;
        result.invalidTokens.push(token);
        if (!result.error) result.error = 'Device is still registered with a legacy Firebase token';
        return;
      }
      try {
        await webpush.sendNotification(sub, payload, {
          TTL: data.type === 'RING' ? 60 : 60 * 60 * 24,
          urgency: 'high',
        });
        result.sent++;
      } catch (e: any) {
        result.failed++;
        const status = e?.statusCode;
        if (status === 404 || status === 410) result.invalidTokens.push(token);
        else if (!result.error) result.error = e?.body || e?.message || String(e);
      }
    }),
  );
  result.ok = result.sent > 0;
  return result;
}
