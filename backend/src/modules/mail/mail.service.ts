import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private enabled() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
  }

  private brand() {
    return {
      name: process.env.NEXT_PUBLIC_APP_NAME || process.env.ORGANIZATION || 'Vicit Llog',
      color: '#1e40af',
      url: process.env.FRONTEND_URL || '',
    };
  }

  private layout(title: string, bodyHtml: string) {
    const b = this.brand();
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
        <tr>
          <td style="background:${b.color};padding:28px 32px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.02em;">${b.name}</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Visitor Access Control</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 28px;color:#0f172a;font-size:15px;line-height:1.6;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 28px;font-size:12px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;">
            Sent by ${b.name} · Do not reply to this email
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private btn(href: string, label: string) {
    const c = this.brand().color;
    return `<p style="text-align:center;margin:28px 0 8px;">
      <a href="${href}" style="display:inline-block;background:${c};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:12px;">${label}</a>
    </p>`;
  }

  private codeBox(label: string, value: string) {
    return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:16px 0;text-align:center;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;margin-bottom:6px;">${label}</div>
      <div style="font-family:ui-monospace,Menlo,monospace;font-size:22px;font-weight:700;letter-spacing:0.12em;color:#0f172a;">${value}</div>
    </div>`;
  }

  async sendMail(opts: { to: string; subject: string; text: string; html?: string }) {
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
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html || this.layout(opts.subject, `<p>${opts.text.replace(/\n/g, '<br/>')}</p>`),
      });
      this.logger.log(`Mail sent to ${opts.to} id=${info.messageId}`);
      return { ok: true, id: info.messageId };
    } catch (e: any) {
      this.logger.error(`Mail failed: ${e.message}`);
      return { ok: false, error: e.message };
    }
  }

  async sendWelcome(to: string, fullName: string, tempPassword: string, loginUrl?: string) {
    const url = loginUrl || this.brand().url;
    const subject = 'Welcome to Vicit Llog — your login details';
    const text = [
      `Hello ${fullName},`,
      ``,
      `Your staff account has been created.`,
      `Email: ${to}`,
      `Temporary password: ${tempPassword}`,
      `Sign in: ${url}`,
      `Change this password on first sign-in.`,
    ].join('\n');
    const html = this.layout(
      subject,
      `
      <p style="margin:0 0 12px;">Hello <strong>${fullName}</strong>,</p>
      <p style="margin:0 0 16px;color:#475569;">Your Vicit Llog staff account is ready. Use the temporary password below to sign in, then choose a new password.</p>
      ${this.codeBox('Email', to)}
      ${this.codeBox('Temporary password', tempPassword)}
      ${url ? this.btn(url, 'Sign in') : ''}
      <p style="margin:20px 0 0;font-size:13px;color:#64748b;">You must change this password on first sign-in. Do not share it.</p>
      `,
    );
    return this.sendMail({ to, subject, text, html });
  }

  async sendPasswordReset(to: string, fullName: string, tempPassword: string, loginUrl?: string) {
    const url = loginUrl || this.brand().url;
    const subject = 'Vicit Llog — password reset';
    const text = [
      `Hello ${fullName},`,
      `Your password was reset by an administrator.`,
      `New temporary password: ${tempPassword}`,
      `Sign in: ${url}`,
      `Change it on next sign-in.`,
    ].join('\n');
    const html = this.layout(
      subject,
      `
      <p style="margin:0 0 12px;">Hello <strong>${fullName}</strong>,</p>
      <p style="margin:0 0 16px;color:#475569;">An administrator reset your password. Use the temporary password below, then set a new one after sign-in.</p>
      ${this.codeBox('New temporary password', tempPassword)}
      ${url ? this.btn(url, 'Sign in & change password') : ''}
      `,
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
    const subject = `Visitor invite: ${opts.purpose}`;
    const when = opts.expectedAt
      ? new Date(opts.expectedAt).toLocaleString('en-GB', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;
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
      subject,
      `
      <p style="margin:0 0 12px;">Hello <strong>${opts.guestName}</strong>,</p>
      <p style="margin:0 0 16px;color:#475569;">
        <strong>${opts.hostName}</strong>${opts.orgName ? ` (${opts.orgName})` : ''} invited you.
      </p>
      <table width="100%" style="background:#f8fafc;border-radius:12px;margin-bottom:16px;">
        <tr><td style="padding:14px 16px;">
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Purpose</div>
          <div style="font-weight:600;margin-top:2px;">${opts.purpose}</div>
          ${
            when
              ? `<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-top:12px;">Date &amp; time</div>
                 <div style="font-weight:600;margin-top:2px;">${when}</div>`
              : ''
          }
        </td></tr>
      </table>
      ${this.btn(opts.link, 'Register on your phone or computer')}
      <p style="font-size:13px;color:#64748b;text-align:center;margin:8px 0 0;">Works on any device with a camera and HTTPS.</p>
      ${this.codeBox('Gate passphrase (backup)', opts.passphrase)}
      <p style="margin:0;font-size:12px;color:#94a3b8;">Link expires in ${opts.ttlMinutes} minutes.</p>
      `,
    );
    return this.sendMail({ to: opts.to, subject, text, html });
  }
}
