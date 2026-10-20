import { Logger } from '@nestjs/common';

/**
 * WhatsApp providers supported via WHATSAPP_PROVIDER env:
 * - twilio
 * - meta            (Meta Cloud API)
 * - log
 */
export async function sendWhatsApp(
  to: string,
  body: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const provider = (process.env.WHATSAPP_PROVIDER || 'log').toLowerCase();
  const logger = new Logger('WhatsAppProvider');

  if (!to) return { ok: false, error: 'No phone number' };
  let phone = to.replace(/\s+/g, '');
  if (phone.startsWith('+')) phone = phone.slice(1);

  try {
    if (provider === 'twilio') {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_WHATSAPP_FROM;
      if (!sid || !token || !from) {
        return {
          ok: false,
          error: 'Twilio WhatsApp env missing (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)',
        };
      }
      const toWa = phone.startsWith('whatsapp:') ? phone : `whatsapp:+${phone}`;
      const auth = Buffer.from(`${sid}:${token}`).toString('base64');
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: toWa, From: from, Body: body }),
        },
      );
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.message || JSON.stringify(data) };
      return { ok: true, id: data.sid };
    }

    if (provider === 'meta') {
      const token = process.env.META_WA_TOKEN;
      const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;
      if (!token || !phoneNumberId) {
        return { ok: false, error: 'META_WA_TOKEN / META_WA_PHONE_NUMBER_ID missing' };
      }
      const res = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'text',
            text: { body },
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error?.message || JSON.stringify(data) };
      }
      return { ok: true, id: data.messages?.[0]?.id };
    }

    logger.log(`[WhatsApp:log] to=${phone} body=${body}`);
    return { ok: true, id: `log-${Date.now()}` };
  } catch (e: any) {
    logger.error(`WhatsApp send failed: ${e.message}`);
    return { ok: false, error: e.message };
  }
}
