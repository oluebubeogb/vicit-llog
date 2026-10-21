/**
 * Visitor-facing frontend base URL. When an admin sets a custom domain in
 * Branding & Settings, invite links and QR emails use https://<customDomain>.
 */
export function publicFrontendBase(customDomain?: string | null): string {
  const d = (customDomain || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (d) return `https://${d}`;
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
}
