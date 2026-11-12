'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Notice } from '@/components/ui/Bits';

export type CustomFieldDef = {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'radio' | 'checkbox' | 'date' | 'dropdown';
  options: string[];
  required: boolean;
  isActive: boolean;
  sortOrder: number;
};

export const FIELD_TYPES: { v: CustomFieldDef['type']; l: string }[] = [
  { v: 'text', l: 'Text' },
  { v: 'textarea', l: 'Text box' },
  { v: 'dropdown', l: 'Dropdown' },
  { v: 'radio', l: 'Radio' },
  { v: 'checkbox', l: 'Checkbox' },
  { v: 'date', l: 'Date' },
];

const needsOptions = (t: string) => t === 'dropdown' || t === 'radio';

/** Inputs for an agency's custom fields on add / edit user forms. */
export function CustomFieldInputs({
  fields,
  value,
  onChange,
}: {
  fields: CustomFieldDef[];
  value: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
}) {
  const active = (fields || []).filter((f) => f.isActive !== false);
  if (!active.length) return null;
  const set = (k: string, v: any) => onChange({ ...(value || {}), [k]: v });
  return (
    <div className="space-y-3 rounded-2xl border border-brand-100 bg-brand-50/30 p-3" data-testid="custom-field-inputs">
      {active.map((f) => {
        const v = value?.[f.key];
        const label = (
          <span className="label !mb-1">
            {f.label}
            {f.required && <span className="text-rose-500">*</span>}
          </span>
        );
        if (f.type === 'textarea')
          return (
            <label key={f.key} className="block">
              {label}
              <textarea rows={2} className="input text-sm" value={v || ''} required={f.required} onChange={(e) => set(f.key, e.target.value)} />
            </label>
          );
        if (f.type === 'dropdown')
          return (
            <label key={f.key} className="block">
              {label}
              <select className="input text-sm" value={v || ''} required={f.required} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">Select {f.label.toLowerCase()}…</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
          );
        if (f.type === 'radio')
          return (
            <fieldset key={f.key}>
              <legend className="label !mb-1">{f.label}{f.required && <span className="text-rose-500">*</span>}</legend>
              <div className="flex flex-wrap gap-1.5">
                {f.options.map((o) => (
                  <label key={o} className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${v === o ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                    <input type="radio" className="sr-only" name={`cf-${f.key}`} checked={v === o} onChange={() => set(f.key, o)} />
                    {o}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        if (f.type === 'checkbox') {
          if (f.options.length) {
            const arr: string[] = Array.isArray(v) ? v : [];
            return (
              <fieldset key={f.key}>
                <legend className="label !mb-1">{f.label}{f.required && <span className="text-rose-500">*</span>}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {f.options.map((o) => (
                    <label key={o} className="flex items-center gap-1.5 text-sm text-slate-700">
                      <input type="checkbox" checked={arr.includes(o)} onChange={(e) => set(f.key, e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} /> {o}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          }
          return (
            <label key={f.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={v === true} onChange={(e) => set(f.key, e.target.checked)} /> {f.label}
              {f.required && <span className="text-rose-500">*</span>}
            </label>
          );
        }
        return (
          <label key={f.key} className="block">
            {label}
            <input type={f.type === 'date' ? 'date' : 'text'} className="input text-sm" value={v || ''} required={f.required} onChange={(e) => set(f.key, e.target.value)} />
          </label>
        );
      })}
    </div>
  );
}

/** Loads an agency's active fields (super admin: by agency id; agency admin: own agency). */
export function useCustomFields(agencyId?: string | null, own?: boolean) {
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  useEffect(() => {
    let off = false;
    const p = own ? api.myCustomFields() : agencyId ? api.agencyCustomFields(agencyId) : Promise.resolve([]);
    p.then((rows: any[]) => !off && setFields((rows || []).filter((r: any) => r.isActive !== false))).catch(() => !off && setFields([]));
    return () => { off = true; };
  }, [agencyId, own]);
  return fields;
}

/** Super Admin: define the extra user fields for one agency (e.g. Rank options per service). */
export function CustomFieldsManager({ agencyId, agencyName }: { agencyId: string; agencyName?: string }) {
  const [rows, setRows] = useState<CustomFieldDef[] | null>(null);
  const [draft, setDraft] = useState({ label: '', type: 'dropdown' as CustomFieldDef['type'], options: '', required: false });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState<Record<string, string>>({});

  async function load() {
    try { setRows(await api.agencyCustomFields(agencyId)); } catch (e: any) { setErr(e.message); setRows([]); }
  }
  useEffect(() => { setRows(null); load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId]);

  const opts = (t: string) => t.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (needsOptions(draft.type) && !opts(draft.options).length) { setErr('Add at least one option'); return; }
    setBusy('add');
    try {
      await api.createCustomField(agencyId, { label: draft.label.trim(), type: draft.type, options: opts(draft.options), required: draft.required });
      setDraft({ label: '', type: 'dropdown', options: '', required: false });
      await load();
    } catch (e: any) { setErr(e.message || 'Could not add field'); } finally { setBusy(''); }
  }

  async function patch(f: CustomFieldDef, data: any) {
    setBusy(f.id);
    setErr('');
    try { await api.updateCustomField(f.id, data); await load(); } catch (e: any) { setErr(e.message || 'Could not save'); } finally { setBusy(''); }
  }

  async function remove(f: CustomFieldDef) {
    if (!confirm(`Remove “${f.label}” from ${agencyName || 'this agency'}? Values already saved on users are kept but hidden.`)) return;
    setBusy(f.id);
    try { await api.deleteCustomField(f.id); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  }

  async function move(i: number, dir: -1 | 1) {
    if (!rows) return;
    const a = rows[i], b = rows[i + dir];
    if (!a || !b) return;
    setBusy(a.id);
    try {
      await api.updateCustomField(a.id, { sortOrder: b.sortOrder === a.sortOrder ? i + dir : b.sortOrder });
      await api.updateCustomField(b.id, { sortOrder: a.sortOrder === b.sortOrder ? i : a.sortOrder });
      await load();
    } finally { setBusy(''); }
  }

  return (
    <section className="surface space-y-3" data-testid="custom-fields-manager">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><SlidersHorizontal size={17} /></span>
        <div>
          <p className="font-semibold text-slate-800">Custom user fields</p>
          <p className="text-xs text-slate-500">Extra fields on {agencyName || 'this agency'}’s add-user forms. Options are unique to this agency (e.g. Rank).</p>
        </div>
      </div>
      {rows === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">No custom fields yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((f, i) => (
            <li key={f.id} className={`rounded-xl border px-3 py-2.5 ${f.isActive ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50 opacity-70'}`}>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{f.label}{f.required && <span className="text-rose-500"> *</span>}</p>
                  <p className="truncate text-[11px] text-slate-500">{FIELD_TYPES.find((t) => t.v === f.type)?.l}{f.options?.length ? ` · ${f.options.join(', ')}` : ''}</p>
                </div>
                <button type="button" className="icon-btn h-7 w-7" disabled={!!busy || i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ChevronUp size={14} /></button>
                <button type="button" className="icon-btn h-7 w-7" disabled={!!busy || i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ChevronDown size={14} /></button>
                <button type="button" className="icon-btn h-7 w-7 hover:!text-rose-600" disabled={!!busy} onClick={() => remove(f)} aria-label={`Remove ${f.label}`}><Trash2 size={14} /></button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                <label className="flex items-center gap-1"><input type="checkbox" checked={f.required} disabled={!!busy} onChange={(e) => patch(f, { required: e.target.checked })} /> Required</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={f.isActive} disabled={!!busy} onChange={(e) => patch(f, { isActive: e.target.checked })} /> Shown</label>
                {(needsOptions(f.type) || f.type === 'checkbox') && (
                  edit[f.id] !== undefined ? (
                    <span className="flex w-full gap-2">
                      <input className="input min-w-0 flex-1 !py-1.5 text-xs" value={edit[f.id]} onChange={(e) => setEdit((x) => ({ ...x, [f.id]: e.target.value }))} placeholder="Comma-separated options" />
                      <button type="button" className="btn-soft !px-3 !py-1.5 text-xs" onClick={async () => { await patch(f, { options: opts(edit[f.id]) }); setEdit((x) => { const c = { ...x }; delete c[f.id]; return c; }); }}>Save</button>
                    </span>
                  ) : (
                    <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={() => setEdit((x) => ({ ...x, [f.id]: (f.options || []).join(', ') }))}>Edit options</button>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="space-y-2 rounded-xl border border-dashed border-brand-200 bg-brand-50/30 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_150px]">
          <input className="input !py-2 text-sm" placeholder="Field name, e.g. Rank" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} required maxLength={60} />
          <select className="input !py-2 text-sm" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as any })} aria-label="Field type">
            {FIELD_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
        {(needsOptions(draft.type) || draft.type === 'checkbox') && (
          <textarea rows={2} className="input text-sm" placeholder={draft.type === 'checkbox' ? 'Options (optional) — leave empty for a single yes/no tick' : 'Options — one per line or comma-separated, e.g. General, Major General, Brigadier'} value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} />
        )}
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} /> Required</label>
          <button type="submit" className="btn-primary !px-4 !py-2 text-sm" disabled={busy === 'add' || !draft.label.trim()}>{busy === 'add' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add field</button>
        </div>
      </form>
      {err && <Notice tone="error">{err}</Notice>}
    </section>
  );
}
