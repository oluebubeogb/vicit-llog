import { BadRequestException } from '@nestjs/common';

export const CUSTOM_FIELD_TYPES = ['text', 'textarea', 'radio', 'checkbox', 'date', 'dropdown'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export function fieldKey(label: string) {
  return (
    String(label || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'field'
  );
}

/**
 * Validate custom field values against the agency's active definitions.
 * Returns a clean object keyed by field key. Unknown keys are dropped.
 * `existing` is merged first so partial updates keep other values.
 */
export async function cleanCustomFields(
  prisma: any,
  organisationId: string,
  input: any,
  opts: { existing?: any; enforceRequired?: boolean } = {},
): Promise<Record<string, any> | undefined> {
  if (input === undefined || input === null) {
    if (!opts.enforceRequired) return undefined;
    input = {};
  }
  if (typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Custom fields must be an object');
  const defs: any[] = await prisma.agencyCustomField.findMany({ where: { organisationId, isActive: true }, orderBy: { sortOrder: 'asc' } });
  const base = opts.existing && typeof opts.existing === 'object' ? { ...opts.existing } : {};
  const out: Record<string, any> = {};
  for (const d of defs) {
    let v = Object.prototype.hasOwnProperty.call(input, d.key) ? input[d.key] : base[d.key];
    if (d.type === 'checkbox') {
      if (d.options?.length) {
        const arr = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
        const bad = arr.find((x: string) => !d.options.includes(x));
        if (bad) throw new BadRequestException(`"${bad}" is not an option for ${d.label}`);
        if (d.required && opts.enforceRequired && !arr.length) throw new BadRequestException(`${d.label} is required`);
        if (arr.length) out[d.key] = arr;
      } else {
        const b = v === true || v === 'true' || v === 'yes' || v === 'on';
        if (d.required && opts.enforceRequired && !b) throw new BadRequestException(`${d.label} must be ticked`);
        if (v !== undefined && v !== null && v !== '') out[d.key] = b;
      }
      continue;
    }
    const s = v === undefined || v === null ? '' : String(v).trim();
    if (!s) {
      if (d.required && opts.enforceRequired) throw new BadRequestException(`${d.label} is required`);
      continue;
    }
    if ((d.type === 'radio' || d.type === 'dropdown') && d.options?.length && !d.options.includes(s)) {
      throw new BadRequestException(`"${s}" is not an option for ${d.label}`);
    }
    if (d.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new BadRequestException(`${d.label} must be a date (YYYY-MM-DD)`);
    out[d.key] = s.slice(0, d.type === 'textarea' ? 2000 : 300);
  }
  return out;
}
