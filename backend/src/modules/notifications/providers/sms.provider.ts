import { Logger } from '@nestjs/common';

/**
 * SMS providers supported via SMS_PROVIDER env:
 * - twilio
 * - termii          (Nigeria / Africa)
 * - africastalking  (Africa)
 * - log             (dev: only logs, no send)
 */
export async function sendSms(to: string, body: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const provider = (process.env.SMS_PROVIDER || 'log').toLowerCase();
  const logger = new Logger('SmsProvider');

  if (!to) return { ok: false, error: 'No phone number' };

  const phone = to.replace(/\s+/g, '');

  try {
    if (provider === 'twilio') {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_SMS_FROM;
      if (!sid || !token || !from) {
        return { ok: false, error: 'Twilio SMS env missing (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM)' };
      }
      const auth = Buffer.from(`${sid}:${token}`).toString('base64');
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: phone, From: from, Body: body }),
        },
      );
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.message || JSON.stringify(data) };
      return { ok: true, id: data.sid };
    }

    if (provider === 'termii') {
      const apiKey = process.env.TERMII_API_KEY;
      const from = process.env.TERMII_SMS_FROM || 'VicitLlog';
      if (!apiKey) return { ok: false, error: 'TERMII_API_KEY missing' };
      const res = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          from,
          sms: body,
          type: 'plain',
          channel: 'generic',
          api_key: apiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok && data.code !== 'ok') {
        return { ok: false, error: data.message || JSON.stringify(data) };
      }
      return { ok: true, id: data.message_id || data.messageId };
    }

    if (provider === 'africastalking') {
      const username = process.env.AT_USERNAME;
      const apiKey = process.env.AT_API_KEY;
      const from = process.env.AT_SMS_FROM || '';
      if (!username || !apiKey) {
        return { ok: false, error: 'AT_USERNAME / AT_API_KEY missing' };
      }
      const params = new URLSearchParams({
        username,
        to: phone,
        message: body,
      });
      if (from) params.set('from', from);
      const res = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params,
      });
      const data = await res.json();
      const recipient = data?.SMSMessageData?.Recipients?.[0];
      if (recipient?.status !== 'Success') {
        return { ok: false, error: recipient?.status || JSON.stringify(data) };
      }
      return { ok: true, id: recipient.messageId };
    }

    logger.log(`[SMS:log] to=${phone} body=${body}`);
    return { ok: true, id: `log-${Date.now()}` };
  } catch (e: any) {
    logger.error(`SMS send failed: ${e.message}`);
    return { ok: false, error: e.message };
  }
}
