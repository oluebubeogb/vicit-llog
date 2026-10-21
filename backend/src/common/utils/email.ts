/** Practical email shape check — rejects obvious typos before SMTP attempts */
export function isValidEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (e.length > 254) return false;
  // basic RFC-ish: local@domain.tld
  const re =
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  if (!re.test(e)) return false;
  // reject consecutive dots, leading/trailing dot in local
  const [local, domain] = e.split('@');
  if (!local || !domain) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (domain.startsWith('-') || domain.endsWith('-') || domain.includes('..')) return false;
  // must have a real TLD (at least 2 chars)
  const parts = domain.split('.');
  if (parts.length < 2 || parts[parts.length - 1].length < 2) return false;
  // common typo domains
  const badDomains = ['gmial.com', 'gmal.com', 'gmail.con', 'yahooo.com', 'hotmial.com', 'outlok.com'];
  if (badDomains.includes(domain)) return false;
  return true;
}
