export function isValidEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (e.length > 254) return false;
  const re =
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  if (!re.test(e)) return false;
  const [local, domain] = e.split('@');
  if (!local || !domain) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (domain.includes('..')) return false;
  const parts = domain.split('.');
  if (parts.length < 2 || parts[parts.length - 1].length < 2) return false;
  const bad = ['gmial.com', 'gmal.com', 'gmail.con', 'yahooo.com', 'hotmial.com', 'outlok.com'];
  if (bad.includes(domain)) return false;
  return true;
}
