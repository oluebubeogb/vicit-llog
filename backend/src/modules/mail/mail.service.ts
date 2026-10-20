import { Injectable, Logger } from '@nestjs/common';

/**
 * Simple SMTP email via native fetch to optional HTTP relay, or nodemailer-style
 * env SMTP if available. Uses raw SMTP over TCP is hard in pure node without lib;
 * we use nodemailer if present, else log.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private enabled() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
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
      // Dynamic import so build works even if nodemailer missing in edge cases
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth:
          process.env.SMTP_USER
            ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS || '',
              }
            : undefined,
      });

      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html || opts.text.replace(/\n/g, '<br/>'),
      });
      this.logger.log(`Mail sent to ${opts.to} id=${info.messageId}`);
      return { ok: true, id: info.messageId };
    } catch (e: any) {
      this.logger.error(`Mail failed: ${e.message}`);
      return { ok: false, error: e.message };
    }
  }

  async sendWelcome(to: string, fullName: string, tempPassword: string, loginUrl?: string) {
    const url = loginUrl || process.env.FRONTEND_URL || '';
    const subject = 'Welcome to Vicit Llog — your login details';
    const text = [
      `Hello ${fullName},`,
      ``,
      `Your Vicit Llog staff account has been created.`,
      ``,
      `Email: ${to}`,
      `Temporary password: ${tempPassword}`,
      ``,
      `Sign in at: ${url}`,
      ``,
      `On first sign-in you must change this password to something only you know.`,
      ``,
      `— Vicit Llog`,
    ].join('\n');
    return this.sendMail({ to, subject, text });
  }

  async sendPasswordReset(to: string, fullName: string, tempPassword: string, loginUrl?: string) {
    const url = loginUrl || process.env.FRONTEND_URL || '';
    const subject = 'Vicit Llog — password reset';
    const text = [
      `Hello ${fullName},`,
      ``,
      `Your password was reset by an administrator.`,
      ``,
      `Email: ${to}`,
      `New temporary password: ${tempPassword}`,
      ``,
      `Sign in at: ${url}`,
      ``,
      `You must change this password on next sign-in.`,
      ``,
      `— Vicit Llog`,
    ].join('\n');
    return this.sendMail({ to, subject, text });
  }
}
