'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import {
  Bell,
  Check,
  Clock,
  Globe,
  ImagePlus,
  Mail,
  Palette,
  RotateCcw,
  Save,
  ShieldCheck,
  Type,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { InfoTip } from '@/components/ui/Tooltip';
import { Notice, SkeletonList } from '@/components/ui/Bits';
import { useBrand } from '@/components/BrandProvider';
import { applyBranding, logoSrc } from '@/lib/brand';

const PRESETS = [
  ['#2563eb', '#1e40af'],
  ['#0f766e', '#134e4a'],
  ['#7c3aed', '#4c1d95'],
  ['#be123c', '#881337'],
  ['#b45309', '#78350f'],
  ['#0f172a', '#334155'],
];

function Section({ icon, title, info, applies, children }: { icon: ReactNode; title: string; info: string; applies: string[]; children: ReactNode }) {
  return (
    <section className="surface animate-in space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 text-brand-600 shadow-sm ring-1 ring-brand-100">{icon}</span>
        <h2 className="font-semibold text-slate-800">{title}</h2>
        <InfoTip text={info} />
      </div>
      {children}
      <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
        Applies to
        {applies.map((a) => (
          <span key={a} className="chip !py-0 !text-[10px]">
            {a}
          </span>
        ))}
      </div>
    </section>
  );
}

function ColorField({ label, value, onChange, tip }: { label: string; value: string; onChange: (v: string) => void; tip: string }) {
  return (
    <label className="block">
      <span className="label">
        {label} <InfoTip text={tip} size={12} />
      </span>
      <span className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 p-1.5 pr-3 transition hover:border-brand-200 focus-within:ring-4 focus-within:ring-brand-100">
        <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg shadow-inner ring-1 ring-black/5" style={{ background: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={label} />
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent font-mono text-sm uppercase text-slate-700 outline-none"
          maxLength={7}
        />
      </span>
    </label>
  );
}

export default function BrandingPage() {
  const { brand, refresh } = useBrand();
  const brandRef = useRef(brand);
  brandRef.current = brand;
  const [form, setForm] = useState({
    name: '',
    logoUrl: '',
    primaryColor: '#2563eb',
    secondaryColor: '#1e40af',
    emailIconBg: '#ffffff',
    customDomain: '',
    requireApproval: false,
    photoRetentionDays: 90,
  });
  const [initial, setInitial] = useState<typeof form | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .branding()
      .then((b) => {
        const f = {
          name: b.name || '',
          logoUrl: b.logoUrl || '',
          primaryColor: b.primaryColor || '#2563eb',
          secondaryColor: b.secondaryColor || '#1e40af',
          emailIconBg: b.emailIconBg || '#ffffff',
          customDomain: b.customDomain || '',
          requireApproval: !!b.requireApproval,
          photoRetentionDays: b.photoRetentionDays ?? 90,
        };
        setForm(f);
        setInitial(f);
      })
      .finally(() => setLoading(false));
    // restore the saved brand if the admin leaves with an unsaved live preview
    return () => applyBranding(brandRef.current);
  }, []);

  const valid = (h: string) => /^#[0-9a-f]{6}$/i.test(h);

  // live preview of colours across the whole app
  useEffect(() => {
    if (loading) return;
    if (valid(form.primaryColor) && valid(form.secondaryColor)) {
      applyBranding({ ...brandRef.current, primaryColor: form.primaryColor, secondaryColor: form.secondaryColor });
    }
  }, [form.primaryColor, form.secondaryColor, loading]);

  const dirty = initial && JSON.stringify(initial) !== JSON.stringify(form);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await api.updateBranding({
        name: form.name,
        primaryColor: form.primaryColor,
        emailIconBg: form.emailIconBg,
        secondaryColor: form.secondaryColor,
        customDomain: form.customDomain,
        requireApproval: form.requireApproval,
        photoRetentionDays: form.photoRetentionDays,
      });
      setInitial(form);
      await refresh();
      window.dispatchEvent(new Event('vicit-brand-updated'));
      setMsg({ tone: 'success', text: 'Saved — your brand is now live across Vicit, emails and the installed app.' });
    } catch (err: any) {
      setMsg({ tone: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function onLogo(file: File) {
    setUploading(true);
    setMsg(null);
    try {
      const res = await api.uploadLogo(file);
      setForm((f) => ({ ...f, logoUrl: res.logoUrl || f.logoUrl }));
      setInitial((i) => (i ? { ...i, logoUrl: res.logoUrl || i.logoUrl } : i));
      await refresh();
      setMsg({ tone: 'success', text: 'Logo uploaded and applied' });
    } catch (err: any) {
      setMsg({ tone: 'error', text: err.message });
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <SkeletonList rows={5} h={110} />
      </div>
    );
  }

  const logo = form.logoUrl ? logoSrc(form.logoUrl) : null;

  return (
    <div className="page">
      <PageHeader back="/admin" icon={<Palette size={20} />} title="Branding & settings" subtitle="Your identity, everywhere" info="Changes preview live. Saving applies them to every page, the installed app, and all outgoing emails." />

      {msg && (
        <Notice tone={msg.tone} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}

      {/* Live preview */}
      <div className="animate-in mb-4 grid grid-cols-[1fr_auto] gap-3">
        <div className="hero !p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo || '/icon-192.png'} alt="" className="h-full w-full object-contain" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{form.name || 'Organisation'}</p>
              <p className="text-[11px] text-white/70">Live preview</p>
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            <span className="rounded-lg bg-white/20 px-2 py-1 text-[10px] font-semibold">Primary</span>
            <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-brand-700">Button</span>
          </div>
        </div>
        <div className="w-[110px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="flex h-9 items-center justify-center" style={{ background: `linear-gradient(135deg, ${form.primaryColor}, ${form.secondaryColor})` }}>
            <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-md p-0.5" style={{ background: form.emailIconBg }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo || '/icon-192.png'} alt="" className="h-full w-full object-contain" />
            </span>
          </div>
          <div className="space-y-1 p-2">
            <span className="block h-1.5 w-3/4 rounded bg-slate-200" />
            <span className="block h-1.5 w-1/2 rounded bg-slate-100" />
            <span className="mt-1.5 block h-3.5 w-14 rounded" style={{ background: form.primaryColor }} />
            <p className="flex items-center gap-1 pt-0.5 text-[9px] text-slate-400">
              <Mail size={9} /> Email
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={save} className="space-y-4 pb-20">
        <Section icon={<Type size={16} />} title="Identity" info="Defaults from the ORGANIZATION env on first boot; editable here anytime." applies={['Navigation', 'Login', 'Visitor pages', 'Emails', 'App name']}>
          <label className="block">
            <span className="label">Organisation name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" required minLength={2} maxLength={120} />
          </label>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => fileRef.current?.click()} className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-brand-200 bg-white transition hover:border-brand-400 hover:shadow-lift">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="Logo" className="h-full w-full object-contain p-1.5 transition group-hover:scale-105" />
              ) : (
                <ImagePlus className="text-brand-300" size={28} />
              )}
              <span className="absolute inset-x-0 bottom-0 bg-slate-900/60 py-0.5 text-center text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">Change</span>
            </button>
            <div>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-ghost">
                <ImagePlus size={16} /> {uploading ? 'Uploading…' : 'Upload logo'}
              </button>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                PNG or JPG <InfoTip text="Max 3 MB. A square image with a transparent background looks best." size={12} />
              </p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} />
            </div>
          </div>
        </Section>

        <Section icon={<Palette size={16} />} title="Colours" info="Every shade on Vicit is generated from these two colours — buttons, gradients, charts, stripes and artwork." applies={['All pages', 'Charts', 'Emails', 'App theme colour']}>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(([p, s]) => (
              <button
                key={p}
                type="button"
                onClick={() => setForm({ ...form, primaryColor: p, secondaryColor: s })}
                className={`relative h-9 w-9 rounded-full shadow-sm ring-2 transition hover:-translate-y-0.5 hover:shadow-lift ${form.primaryColor === p ? 'ring-slate-900' : 'ring-white'}`}
                style={{ background: `linear-gradient(135deg, ${p}, ${s})` }}
                aria-label={`Use ${p}`}
              >
                {form.primaryColor === p && <Check size={14} className="absolute inset-0 m-auto text-white" />}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ColorField label="Primary" value={form.primaryColor} onChange={(v) => setForm({ ...form, primaryColor: v })} tip="Main brand colour — buttons, highlights, navigation" />
            <ColorField label="Secondary" value={form.secondaryColor} onChange={(v) => setForm({ ...form, secondaryColor: v })} tip="Accent colour — gradient ends, depth and splash background" />
          </div>
          <div className="flex h-3 overflow-hidden rounded-full">
            {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((s) => (
              <span key={s} className="flex-1" style={{ background: `rgb(var(--brand-${s}))` }} />
            ))}
          </div>
          <ColorField label="Email logo background" value={form.emailIconBg || '#ffffff'} onChange={(v) => setForm({ ...form, emailIconBg: v })} tip="Background behind your logo in emails (use white for transparent PNGs)" />
        </Section>

        <Section icon={<Globe size={16} />} title="Custom domain" info="Registration links and QR emails will point to this domain. Point its DNS at your Vicit frontend first." applies={['Invite links', 'QR emails']}>
          <input value={form.customDomain} onChange={(e) => setForm({ ...form, customDomain: e.target.value.trim() })} className="input" placeholder="visitors.yourorg.com" />
        </Section>

        <Section icon={<ShieldCheck size={16} />} title="Approvals & privacy" info="Control who can invite instantly and how long visitor photos are kept." applies={['New invites', 'Admin approvals', 'Photo cleanup']}>
          <button
            type="button"
            role="switch"
            aria-checked={form.requireApproval}
            onClick={() => setForm({ ...form, requireApproval: !form.requireApproval })}
            className="tile flex w-full items-center gap-3 text-left transition hover:shadow-soft"
          >
            <Bell size={18} className="text-brand-600" />
            <span className="flex-1">
              <span className="flex items-center gap-1 text-sm font-semibold text-slate-800">
                Require approval for invites
                <InfoTip text="When on, invites from staff wait for an admin. Guests are emailed only after approval." size={12} />
              </span>
              <span className="block text-xs text-slate-500">{form.requireApproval ? 'Admins approve every staff invite' : 'Staff invites go out instantly'}</span>
            </span>
            <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${form.requireApproval ? 'bg-gradient-to-r from-brand-500 to-brand-700' : 'bg-slate-200'}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${form.requireApproval ? 'left-6' : 'left-1'}`} />
            </span>
          </button>
          <label className="block">
            <span className="label">
              <Clock size={14} /> Photo retention
              <InfoTip text="Visitor photos older than this are deleted by the automatic cleanup (7–3650 days)." size={12} />
            </span>
            <span className="flex items-center gap-3">
              <input type="range" min={7} max={365} value={Math.min(365, form.photoRetentionDays)} onChange={(e) => setForm({ ...form, photoRetentionDays: parseInt(e.target.value) })} className="flex-1 accent-[rgb(var(--brand-600))]" />
              <input type="number" min={7} max={3650} value={form.photoRetentionDays} onChange={(e) => setForm({ ...form, photoRetentionDays: parseInt(e.target.value) || 90 })} className="input !w-24 !py-2 text-center" />
              <span className="text-xs text-slate-500">days</span>
            </span>
          </label>
        </Section>

        <div className="fixed inset-x-0 bottom-[calc(var(--nav-height)+max(0.6rem,var(--safe-bottom))+0.5rem)] z-40 px-4">
          <div className={`mx-auto flex max-w-lg gap-2 rounded-2xl border border-white/70 bg-white/85 p-2 shadow-lift backdrop-blur-xl transition duration-300 ${dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'}`}>
            <button type="button" className="btn-ghost" onClick={() => initial && setForm(initial)}>
              <RotateCcw size={15} /> Reset
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              <Save size={16} /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
