import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export type MailBrand = {
  name: string;
  appName: string;
  color: string;
  color2: string;
  url: string;
  iconBg: string;
  logoPath: string;
};

/** Escape user-provided text before it goes into email HTML. */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtWhen(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Mix a hex colour with white (amount 0..1) — for email-safe light tints. */
function tint(hex: string, amount: number) {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return '#f1f5f9';
  const c = m.slice(1).map((x) => parseInt(x, 16));
  const out = c.map((v) => Math.round(v + (255 - v) * amount));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private brandCache: { at: number; value: MailBrand } | null = null;

  constructor(@Optional() private prisma?: PrismaService) {}

  private enabled() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
  }

  /**
   * Branding for emails comes from Branding & Settings (organisation name, logo, colours,
   * email icon background), falling back to env. Cached for 60s.
   */
  async brand(): Promise<MailBrand> {
    if (this.brandCache && Date.now() - this.brandCache.at < 60_000) return this.brandCache.value;
    let org: any = null;
    try {
      if (this.prisma) {
        const code = (process.env.ORGANIZATION_CODE || '').toUpperCase().trim();
        org =
          (code ? await this.prisma.organisation.findUnique({ where: { code } }) : null) ||
          (await this.prisma.organisation.findFirst({ orderBy: { createdAt: 'asc' } }));
      }
    } catch {
      org = null;
    }
    const frontend = org?.customDomain
      ? `https://${String(org.customDomain).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
      : (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const api = (process.env.API_PUBLIC_URL || process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
    let logo = process.env.EMAIL_LOGO_URL || '';
    if (!logo && org?.logoUrl) {
      logo = /^https?:\/\//.test(org.logoUrl) ? org.logoUrl : api ? `${api}${org.logoUrl}` : '';
    }
    if (!logo && frontend) logo = `${frontend}/icon-192.png`;
    const value: MailBrand = {
      name: org?.name || process.env.ORGANIZATION || process.env.NEXT_PUBLIC_APP_NAME || 'Vicit Llog',
      appName: process.env.NEXT_PUBLIC_APP_NAME || 'Vicit Llog',
      color: org?.primaryColor || process.env.EMAIL_BRAND_COLOR || '#2563eb',
      color2: org?.secondaryColor || '#1e40af',
      url: frontend,
      iconBg: org?.emailIconBg || process.env.EMAIL_ICON_BG || '#ffffff',
      logoPath: logo,
    };
    this.brandCache = { at: Date.now(), value };
    return value;
  }

  // ------------------------------------------------------------------ building blocks

  /** Full email shell: table layout, inline styles, light-mode only, hidden preheader. */
  layout(b: MailBrand, title: string, bodyHtml: string, preheader = '') {
    const logoBlock = b.logoPath
      ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 14px;">
           <tr><td bgcolor="${b.iconBg}" style="background:${b.iconBg};border-radius:18px;padding:8px;box-shadow:0 6px 18px rgba(15,23,42,0.18);">
             <img src="${esc(b.logoPath)}" alt="" width="52" height="52" style="display:block;width:52px;height:52px;border:0;border-radius:12px;object-fit:contain;" />
           </td></tr>
         </table>`
      : '';
    const soft = tint(b.color, 0.94);
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/><meta name="supported-color-schemes" content="light"/>
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  @media (max-width:600px){ .px{padding-left:20px !important;padding-right:20px !important;} .h1{font-size:22px !important;} }
  a { color:${b.color}; }
</style></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:${FONT};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader || title)}&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef2f7"
    style="background:#eef2f7;background-image:linear-gradient(180deg,${soft} 0%,#eef2f7 55%,#f8fafc 100%);padding:36px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td bgcolor="${b.color}" style="background:${b.color};background-image:linear-gradient(135deg,${b.color} 0%,${b.color2} 100%);border-radius:24px 24px 0 0;padding:34px 32px 30px;text-align:center;">
          ${logoBlock}
          <div style="font-size:21px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">${esc(b.name)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.82);margin-top:6px;letter-spacing:0.14em;text-transform:uppercase;">Visitor Access</div>
        </td></tr>
        <tr><td bgcolor="#ffffff" class="px" style="background:#ffffff;padding:34px 36px 30px;color:#0f172a;font-size:15px;line-height:1.65;border-left:1px solid #e6ebf2;border-right:1px solid #e6ebf2;">
          ${bodyHtml}
        </td></tr>
        <tr><td bgcolor="#f8fafc" style="background:#f8fafc;border:1px solid #e6ebf2;border-top:0;border-radius:0 0 24px 24px;padding:18px 32px 22px;text-align:center;">
          <div style="font-size:12px;color:#64748b;">${esc(b.name)} · secured by ${esc(b.appName)}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:4px;">This is an automated message — please do not reply.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private heading(b: MailBrand, eyebrow: string, title: string) {
    return `<div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${b.color};margin:0 0 6px;">${esc(eyebrow)}</div>
      <div class="h1" style="font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;line-height:1.25;margin:0 0 14px;">${esc(title)}</div>`;
  }

  private btn(b: MailBrand, href: string, label: string) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:26px auto 10px;">
      <tr><td bgcolor="${b.color}" style="background:${b.color};background-image:linear-gradient(135deg,${b.color} 0%,${b.color2} 100%);border-radius:14px;box-shadow:0 8px 20px ${tint(b.color, 0.55)};">
        <a href="${esc(href)}" style="display:inline-block;padding:15px 30px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;font-family:${FONT};">${esc(label)} &rarr;</a>
      </td></tr>
    </table>`;
  }

  private codeBox(b: MailBrand, label: string, value: string, hint = '') {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;">
      <tr><td bgcolor="${tint(b.color, 0.95)}" style="background:${tint(b.color, 0.95)};border:1px dashed ${tint(b.color, 0.6)};border-radius:16px;padding:16px 18px;text-align:center;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#64748b;margin-bottom:6px;">${esc(label)}</div>
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:22px;font-weight:700;letter-spacing:0.14em;color:#0f172a;">${esc(value)}</div>
        ${hint ? `<div style="font-size:12px;color:#94a3b8;margin-top:6px;">${esc(hint)}</div>` : ''}
      </td></tr>
    </table>`;
  }

  /** Key/value summary card with a brand accent bar. */
  private facts(b: MailBrand, rows: Array<[string, string | null | undefined]>) {
    const body = rows
      .filter(([, v]) => v)
      .map(
        ([k, v], i) => `<tr><td style="padding:${i ? '10px' : '0'} 0 0;">
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">${esc(k)}</div>
          <div style="font-size:15px;font-weight:600;color:#0f172a;margin-top:2px;">${esc(v)}</div>
        </td></tr>`,
      )
      .join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;">
      <tr>
        <td width="4" bgcolor="${b.color}" style="background:${b.color};border-radius:4px;"></td>
        <td bgcolor="#f8fafc" style="background:#f8fafc;border-radius:0 14px 14px 0;padding:14px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>
        </td>
      </tr>
    </table>`;
  }

  private p(text: string, muted = false) {
    return `<p style="margin:0 0 14px;color:${muted ? '#64748b' : '#334155'};">${text}</p>`;
  }

  // ------------------------------------------------------------------ transport

  async sendMail(opts: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachments?: Array<{
      filename?: string;
      content?: Buffer | string;
      path?: string;
      cid?: string;
      contentType?: string;
      encoding?: string;
      contentDisposition?: 'inline' | 'attachment';
    }>;
  }) {
    if (!opts.to) {
      this.logger.warn('sendMail skipped: no recipient');
      return { ok: false, error: 'no recipient' };
    }
    if (!this.enabled()) {
      this.logger.log(`[mail:disabled] to=${opts.to} subject=${opts.subject}\n${opts.text}`);
      return { ok: false, error: 'SMTP not configured' };
    }
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
          : undefined,
      });
      const b = await this.brand();
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html:
          opts.html ||
          this.layout(b, opts.subject, `<p>${esc(opts.text).replace(/\n/g, '<br/>')}</p>`),
        attachments: opts.attachments || [],
      });
      this.logger.log(`Mail sent to ${opts.to} id=${info.messageId}`);
      return { ok: true, id: info.messageId };
    } catch (e: any) {
      this.logger.error(`Mail failed: ${e.message}`);
      return { ok: false, error: e.message };
    }
  }

  // ------------------------------------------------------------------ templates

  async sendWelcome(to: string, fullName: string, tempPassword: string, loginUrl?: string) {
    const b = await this.brand();
    const url = loginUrl || (b.url ? `${b.url}/login` : '');
    const subject = `Welcome to ${b.name} — your login details`;
    const text = [
      `Hello ${fullName},`,
      ``,
      `Your staff account has been created.`,
      `Email: ${to}`,
      `Temporary password: ${tempPassword}`,
      url ? `Sign in: ${url}` : '',
      `Change this password on first sign-in.`,
    ]
      .filter((l) => l !== null)
      .join('\n');
    const html = this.layout(
      b,
      subject,
      `${this.heading(b, 'Welcome aboard', `Hello ${fullName}`)}
      ${this.p(`Your <strong>${esc(b.name)}</strong> staff account is ready. Sign in with the temporary password below, then choose your own.`)}
      ${this.facts(b, [['Sign-in email', to]])}
      ${this.codeBox(b, 'Temporary password', tempPassword, 'You will be asked to change it on first sign-in')}
      ${url ? this.btn(b, url, 'Sign in') : ''}
      ${this.p('Never share this password. Our team will never ask you for it.', true)}`,
      'Your staff account is ready — sign in and set your password.',
    );
    return this.sendMail({ to, subject, text, html });
  }

  async sendPasswordReset(to: string, fullName: string, tempPassword: string, loginUrl?: string) {
    const b = await this.brand();
    const url = loginUrl || (b.url ? `${b.url}/login` : '');
    const subject = `${b.name} — password reset`;
    const text = [
      `Hello ${fullName},`,
      `Your password was reset by an administrator.`,
      `New temporary password: ${tempPassword}`,
      url ? `Sign in: ${url}` : '',
      `Change it on next sign-in.`,
    ].join('\n');
    const html = this.layout(
      b,
      subject,
      `${this.heading(b, 'Security', 'Your password was reset')}
      ${this.p(`Hello <strong>${esc(fullName)}</strong>, an administrator issued you a new temporary password.`)}
      ${this.codeBox(b, 'New temporary password', tempPassword, 'Set a new password right after signing in')}
      ${url ? this.btn(b, url, 'Sign in & change password') : ''}
      ${this.p('If you did not expect this, contact your administrator immediately.', true)}`,
      'An administrator reset your password.',
    );
    return this.sendMail({ to, subject, text, html });
  }

  async sendInviteEmail(opts: {
    to: string;
    guestName: string;
    hostName: string;
    purpose: string;
    link: string;
    passphrase: string;
    ttlMinutes: number;
    expectedAt?: string | null;
    orgName?: string;
  }) {
    const b = await this.brand();
    const subject = `You're invited: ${opts.purpose}`;
    const when = opts.expectedAt ? fmtWhen(opts.expectedAt) : null;
    const text = [
      `Hello ${opts.guestName},`,
      `You have been invited by ${opts.hostName}.`,
      `Purpose: ${opts.purpose}`,
      when ? `When: ${when}` : '',
      `Register here: ${opts.link}`,
      `Gate passphrase: ${opts.passphrase}`,
      `Link expires in ${opts.ttlMinutes} minutes.`,
    ]
      .filter(Boolean)
      .join('\n');
    const html = this.layout(
      b,
      subject,
      `${this.heading(b, 'Visitor invitation', `Hello ${opts.guestName}`)}
      ${this.p(`<strong>${esc(opts.hostName)}</strong>${opts.orgName ? ` at ${esc(opts.orgName)}` : ''} has invited you. Register in under a minute — take a quick photo and you will receive your gate QR code.`)}
      ${this.facts(b, [
        ['Purpose', opts.purpose],
        ['Host', opts.hostName],
        ['Date & time', when],
      ])}
      ${this.btn(b, opts.link, 'Complete registration')}
      <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0 0 6px;">Works on any phone or computer with a camera · link expires in ${esc(opts.ttlMinutes)} minutes</p>
      ${this.codeBox(b, 'Gate passphrase (backup)', opts.passphrase, 'Tell the gate officer if your QR will not scan')}`,
      `${opts.hostName} invited you — register to get your gate QR code.`,
    );
    return this.sendMail({ to: opts.to, subject, text, html });
  }

  async sendVisitorQrEmail(opts: {
    to: string;
    guestName: string;
    hostName: string;
    purpose: string;
    passphrase: string;
    /** Raw PNG bytes (preferred) */
    qrPng?: Buffer;
    /** Legacy: data:image/png;base64,... */
    qrDataUrl?: string;
    /** Public hosted PNG (fallback for clients that hide inline images) */
    qrImageUrl?: string;
    /** Visitor page link — QR is always shown there too */
    registrationLink?: string;
    orgName?: string;
  }) {
    const b = await this.brand();
    const subject = `Your gate QR code — ${opts.purpose}`;
    const text = [
      `Hello ${opts.guestName},`,
      `Your photo registration is complete.`,
      `Host: ${opts.hostName}`,
      `Purpose: ${opts.purpose}`,
      `Gate passphrase: ${opts.passphrase}`,
      `Show the QR code in this email (attached as gate-qr.png) or on your registration page at the gate.`,
      opts.registrationLink ? `Your registration page (shows the QR): ${opts.registrationLink}` : '',
      opts.qrImageUrl ? `QR image: ${opts.qrImageUrl}` : '',
      `If the QR will not scan, tell the gate officer your passphrase.`,
    ]
      .filter(Boolean)
      .join('\n');

    // Embed QR as a CID inline attachment — data: URIs are blocked by Gmail, Outlook and
    // many mobile clients; CID images render in Apple Mail (iPhone), Gmail and Outlook.
    let png: Buffer | null = opts.qrPng || null;
    if (!png) {
      const match = (opts.qrDataUrl || '').match(/^data:image\/png;base64,(.+)$/i);
      if (match) png = Buffer.from(match[1], 'base64');
    }
    const attachments: any[] = png
      ? [
          {
            filename: 'gate-qr.png',
            content: png,
            cid: 'visitor-qr@vicit',
            contentType: 'image/png',
            contentDisposition: 'inline',
          },
        ]
      : [];

    // White padded cell with bgcolor attr so dark-mode clients keep the QR on white.
    const qrBlock = png
      ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:22px auto 10px;">
          <tr><td bgcolor="${tint(b.color, 0.92)}" style="background:${tint(b.color, 0.92)};background-image:linear-gradient(135deg,${tint(b.color, 0.88)} 0%,${tint(b.color2, 0.93)} 100%);padding:10px;border-radius:24px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td bgcolor="#ffffff" style="background:#ffffff;padding:14px;border-radius:16px;">
                <img src="cid:visitor-qr@vicit" alt="Gate QR code" width="240" height="240"
                  style="display:block;width:240px;height:240px;max-width:240px;background:#ffffff;border:0;outline:none;image-rendering:pixelated;" />
              </td>
            </tr></table>
          </td></tr>
        </table>`
      : '';
    const links: string[] = [];
    if (opts.registrationLink) {
      links.push(`<a href="${esc(opts.registrationLink)}" style="color:${b.color};font-weight:600;">open your registration page</a>`);
    }
    if (opts.qrImageUrl) {
      links.push(`<a href="${esc(opts.qrImageUrl)}" style="color:${b.color};font-weight:600;">open the QR image</a>`);
    }
    const fallback = `<p style="text-align:center;color:#64748b;font-size:13px;margin:0 0 8px;">
        ${png ? 'QR not showing?' : 'Your QR code is ready.'}
        ${links.length ? ` You can ${links.join(' or ')}.` : ' Open your registration link to view it on your phone.'}
        <br/>Tip: turn your screen brightness up at the gate.
      </p>`;

    const html = this.layout(
      b,
      subject,
      `${this.heading(b, 'You are all set', `See you soon, ${opts.guestName}`)}
      ${this.p('Your photo is registered. Present this QR code at the gate when you arrive — the passphrase works as a backup.')}
      ${qrBlock}
      ${fallback}
      ${this.codeBox(b, 'Gate passphrase', opts.passphrase)}
      ${this.facts(b, [
        ['Host', `${opts.hostName}${opts.orgName ? ` · ${opts.orgName}` : ''}`],
        ['Purpose', opts.purpose],
      ])}`,
      'Your gate QR code is inside — show it on arrival.',
    );
    return this.sendMail({ to: opts.to, subject, text, html, attachments });
  }

  async sendHostVisitorUpdate(opts: {
    to: string;
    hostName: string;
    guestName: string;
    purpose: string;
    event: 'photo' | 'arrival' | 'exit' | 'denied';
    orgName?: string;
    at?: string | null;
    reason?: string;
  }) {
    const b = await this.brand();
    const labels = {
      photo: { title: 'Guest photo captured', verb: 'completed photo registration', eyebrow: 'Registration', color: b.color },
      arrival: { title: 'Visitor arrived', verb: 'has entered the premises', eyebrow: 'Arrival', color: '#059669' },
      exit: { title: 'Visitor exited', verb: 'has left the premises', eyebrow: 'Departure', color: '#d97706' },
      denied: { title: 'Visitor entry declined', verb: 'was declined at the gate', eyebrow: 'Entry declined', color: '#dc2626' },
    };
    const L = labels[opts.event];
    const subject = `${L.title}: ${opts.guestName}`;
    const when = fmtWhen(opts.at);
    const text = [
      `Hello ${opts.hostName},`,
      `${opts.guestName} ${L.verb}.`,
      `Purpose: ${opts.purpose}`,
      opts.reason ? `Reason: ${opts.reason}` : '',
      `Time: ${when}`,
    ]
      .filter(Boolean)
      .join('\n');
    const html = this.layout(
      b,
      subject,
      `<div style="display:inline-block;background:${tint(L.color, 0.9)};color:${L.color};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:6px 12px;border-radius:999px;margin-bottom:12px;">${esc(L.eyebrow)}</div>
      <div class="h1" style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;margin:0 0 12px;">${esc(opts.guestName)} ${esc(L.verb)}</div>
      ${this.p(`Hello <strong>${esc(opts.hostName)}</strong>, here is the latest on your visitor.`, true)}
      ${this.facts(b, [
        ['Visitor', opts.guestName],
        ['Purpose', opts.purpose],
        ['Reason', opts.reason || null],
        ['Time', when],
      ])}
      ${b.url ? this.btn(b, `${b.url}/notifications`, 'View in app') : ''}`,
      `${opts.guestName} ${L.verb}.`,
    );
    return this.sendMail({ to: opts.to, subject, text, html });
  }
}
