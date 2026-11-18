'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RotateCcw, X, Sparkles, Phone, Briefcase } from 'lucide-react';
import { api } from '@/lib/api';
import { CUSTOM_FIELDS_CHANGED } from '@/components/CustomFields';
import { roleLabel } from '@/lib/roleLabels';
import { titleCase } from '@/lib/format';
import Avatar from '@/components/ui/Avatar';
import {
  DEFAULT_PROFILE_TEMPLATES,
  SYSTEM_PLACEHOLDERS,
  mergeTemplates,
  profileVars,
  renderList,
  renderTemplate,
  type ProfileTemplates,
} from '@/lib/profileTemplate';

type Surface = 'dashboard' | 'hostCard' | 'myProfile';
type FieldKey = 'title' | 'subtitle' | 'meta' | `list:${number}`;

const SURFACES: Array<{ id: Surface; label: string; hint: string }> = [
  { id: 'dashboard', label: 'Dashboard greeting', hint: 'The greeting card at the top of Home' },
  { id: 'hostCard', label: 'Host profile card', hint: 'The header of a host’s profile page (/u/…)' },
  { id: 'myProfile', label: 'My profile header', hint: 'The header of each user’s own Profile page' },
];

/** Super Admin builder for the platform-wide profile header templates (v25). */
export default function ProfileHeaderBuilder({ value, onChange }: { value: ProfileTemplates; onChange: (v: ProfileTemplates) => void }) {
  const tpl = mergeTemplates(value);
  const [surface, setSurface] = useState<Surface>('dashboard');
  const [custom, setCustom] = useState<Array<{ token: string; label: string; agencies: string[] }>>([]);
  const [samples, setSamples] = useState<any[]>([]);
  const [sampleId, setSampleId] = useState('');
  const [sample, setSample] = useState<any>(null);
  const [focus, setFocus] = useState<{ key: FieldKey; pos: number } | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Placeholder chips come from every active custom field across agencies. Re-load on focus and
  // when fields change on this tab, so a newly added field shows up as a chip without a reload.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const onVisible = () => { if (document.visibilityState === 'visible') bump(); };
    window.addEventListener(CUSTOM_FIELDS_CHANGED, bump);
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(CUSTOM_FIELDS_CHANGED, bump);
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  useEffect(() => {
    api.profileBuilder().then((d: any) => {
      setCustom(d.custom || []);
      setSamples(d.samples || []);
      setSampleId((cur) => {
        if (cur && (d.samples || []).some((s: any) => s.id === cur)) return cur;
        const first = (d.samples || []).find((s: any) => s.role !== 'SUPER_ADMIN') || d.samples?.[0];
        return first ? first.id : '';
      });
    }).catch(() => {});
  }, [tick]);
  useEffect(() => {
    if (!sampleId) return;
    api.profileBuilderSample(sampleId).then(setSample).catch(() => setSample(null));
  }, [sampleId, tick]);

  const s = tpl[surface] as any;
  const listKey = surface === 'dashboard' ? 'chips' : surface === 'myProfile' ? 'badges' : null;
  const list: string[] = listKey ? s[listKey] || [] : [];

  function set(patch: any) {
    onChange({ ...tpl, [surface]: { ...tpl[surface], ...patch } } as ProfileTemplates);
  }
  function getField(key: FieldKey) {
    if (key.startsWith('list:')) return list[Number(key.slice(5))] || '';
    return s[key] || '';
  }
  function setField(key: FieldKey, v: string) {
    if (key.startsWith('list:')) {
      const i = Number(key.slice(5));
      const next = [...list];
      next[i] = v;
      set({ [listKey!]: next });
    } else set({ [key]: v });
  }
  function insert(token: string) {
    const key: FieldKey = focus?.key || 'title';
    const cur = getField(key);
    const pos = Math.min(focus?.pos ?? cur.length, cur.length);
    const ins = `${pos > 0 && !/\s$/.test(cur.slice(0, pos)) ? ' ' : ''}[${token}]`;
    const next = cur.slice(0, pos) + ins + cur.slice(pos);
    setField(key, next);
    const newPos = pos + ins.length;
    setFocus({ key, pos: newPos });
    requestAnimationFrame(() => {
      const el = inputs.current[`${surface}:${key}`];
      if (el) { el.focus(); el.setSelectionRange(newPos, newPos); }
    });
  }
  const track = (key: FieldKey) => (e: React.SyntheticEvent<HTMLInputElement>) => setFocus({ key, pos: (e.target as HTMLInputElement).selectionStart ?? 0 });

  const field = (key: FieldKey, label: string, placeholder: string, onRemove?: () => void) => (
    <label className="block" key={`${surface}:${key}`}>
      <span className="label">{label}</span>
      <span className="flex gap-1.5">
        <input
          ref={(el) => { inputs.current[`${surface}:${key}`] = el; }}
          value={getField(key)}
          onChange={(e) => { setField(key, e.target.value); setFocus({ key, pos: e.target.selectionStart ?? e.target.value.length }); }}
          onFocus={track(key)}
          onClick={track(key)}
          onKeyUp={track(key)}
          className={`input font-mono !text-[13px] ${focus?.key === key ? 'ring-2 ring-brand-200' : ''}`}
          placeholder={placeholder}
          maxLength={key.startsWith('list:') ? 80 : 160}
          data-testid={`tpl-${surface}-${key.replace(':', '-')}`}
        />
        {onRemove && (
          <button type="button" onClick={onRemove} className="btn-quiet !px-2.5" aria-label={`Remove ${label}`}><X size={14} /></button>
        )}
      </span>
    </label>
  );

  const vars = useMemo(() => profileVars(sample, { roleText: roleLabel }), [sample]);
  const dashVars = useMemo(() => profileVars(sample, { roleText: (r) => titleCase(r === 'GATE' ? 'Gate officer' : String(r)) }), [sample]);
  const tokens = [...SYSTEM_PLACEHOLDERS.map((p) => ({ token: p.token, label: p.label, agencies: [] as string[] })), ...custom.filter((c) => !SYSTEM_PLACEHOLDERS.some((p) => p.token === c.token))];

  return (
    <div className="space-y-3" data-testid="profile-header-builder">
      <div className="segmented !flex-wrap">
        {SURFACES.map((x) => (
          <button key={x.id} type="button" data-active={surface === x.id} onClick={() => { setSurface(x.id); setFocus(null); }}>{x.label}</button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">{SURFACES.find((x) => x.id === surface)?.hint}. Tap a placeholder to insert it where the cursor is. Empty values are left out together with their separator.</p>

      <div className="flex flex-wrap gap-1.5" data-testid="placeholder-chips">
        {tokens.map((t) => (
          <button
            key={t.token}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(t.token)}
            title={t.agencies.length ? `${t.label} — custom field in ${t.agencies.join(', ')}` : t.label}
            className={`chip !py-1 font-mono !text-[11px] transition hover:-translate-y-0.5 ${t.agencies.length ? '!bg-violet-50 !text-violet-700 ring-1 ring-violet-100' : ''}`}
          >
            [{t.token}]
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2.5">
          {field('title', 'Title', '[fullname]')}
          {field('subtitle', 'Subtitle', surface === 'dashboard' ? '[agency] · [role]' : surface === 'hostCard' ? '[agency]' : '[email]')}
          {surface === 'myProfile' && field('meta', 'Line after badges', '[agency]')}
          {listKey && (
            <div className="space-y-2">
              {list.map((_, i) => field(`list:${i}`, `${surface === 'dashboard' ? 'Chip' : 'Badge'} ${i + 1}`, '[rank]', () => { const next = list.filter((__, j) => j !== i); set({ [listKey]: next }); setFocus(null); }))}
              {list.length < 6 && (
                <button type="button" className="btn-ghost !py-2 !text-xs" onClick={() => { set({ [listKey]: [...list, ''] }); setFocus({ key: `list:${list.length}`, pos: 0 }); }}>
                  <Plus size={14} /> Add {surface === 'dashboard' ? 'chip' : 'badge'}
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="btn-quiet !py-2 !text-xs" data-testid="tpl-reset-surface" onClick={() => { onChange({ ...tpl, [surface]: DEFAULT_PROFILE_TEMPLATES[surface] } as ProfileTemplates); setFocus(null); }}>
              <RotateCcw size={13} /> Reset this surface
            </button>
            <button type="button" className="btn-quiet !py-2 !text-xs" data-testid="tpl-reset-all" onClick={() => { onChange(mergeTemplates(null)); setFocus(null); }}>
              <RotateCcw size={13} /> Reset all to default
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block">
            <span className="label">Preview as</span>
            <select className="input" value={sampleId} onChange={(e) => setSampleId(e.target.value)} data-testid="tpl-sample-picker">
              {samples.map((u: any) => <option key={u.id} value={u.id}>{u.fullName} · {u.agency || 'Platform'} · {roleLabel(u.role)}</option>)}
            </select>
          </label>
          <div data-testid="tpl-preview">
            {surface === 'dashboard' && (
              <div className="hero !mb-0 !p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-on-brand/75"><Sparkles size={13} /> Good morning</p>
                <p className="mt-1 truncate text-xl font-bold tracking-tight">{renderTemplate(tpl.dashboard.title, dashVars) || sample?.fullName || '—'}</p>
                {renderTemplate(tpl.dashboard.subtitle, dashVars) && <p className="mt-0.5 truncate text-sm text-on-brand/75">{renderTemplate(tpl.dashboard.subtitle, dashVars)}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full bg-on-brand/15 px-2.5 py-1 ring-1 ring-on-brand/20">2 guests on site</span>
                  {renderList(tpl.dashboard.chips, dashVars).map((c, i) => <span key={i} className="rounded-full bg-on-brand/15 px-2.5 py-1 font-medium ring-1 ring-on-brand/20">{c}</span>)}
                </div>
              </div>
            )}
            {surface === 'hostCard' && (
              <div className="hero !mb-0 !p-4 text-center">
                <div className="mx-auto mb-2 w-fit"><Avatar name={sample?.fullName} size={56} ring={false} /></div>
                <p className="text-xl font-bold">{renderTemplate(tpl.hostCard.title, vars) || sample?.fullName || '—'}</p>
                {renderTemplate(tpl.hostCard.subtitle, vars) && <p className="mt-0.5 text-sm text-on-brand/75">{renderTemplate(tpl.hostCard.subtitle, vars)}</p>}
                <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-[11px]">
                  {sample?.portfolio && <span className="inline-flex items-center gap-1 rounded-full bg-on-brand/15 px-2.5 py-1 ring-1 ring-on-brand/20"><Briefcase size={11} /> {sample.portfolio}</span>}
                  {sample?.phone && <span className="inline-flex items-center gap-1 rounded-full bg-on-brand/15 px-2.5 py-1 ring-1 ring-on-brand/20"><Phone size={11} /> {sample.phone}</span>}
                </div>
              </div>
            )}
            {surface === 'myProfile' && (
              <div className="hero !mb-0 flex items-center gap-3 !p-4">
                <Avatar name={sample?.fullName} size={56} ring={false} />
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">{renderTemplate(tpl.myProfile.title, vars) || sample?.fullName || '—'}</p>
                  {renderTemplate(tpl.myProfile.subtitle, vars) && <p className="truncate text-sm text-on-brand/75">{renderTemplate(tpl.myProfile.subtitle, vars)}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {renderList(tpl.myProfile.badges, vars).map((b, i) => <span key={i} className="rounded-full bg-on-brand/20 px-2 py-0.5 text-[11px] font-semibold ring-1 ring-on-brand/25">{b}</span>)}
                    {renderTemplate(tpl.myProfile.meta, vars) && <span className="truncate text-[11px] text-on-brand/70">{renderTemplate(tpl.myProfile.meta, vars)}</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
          {sample && (
            <p className="text-[11px] text-slate-400">
              Values for this person: {Object.entries(vars).filter(([, v]) => v).map(([k, v]) => `[${k}] = ${v}`).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
