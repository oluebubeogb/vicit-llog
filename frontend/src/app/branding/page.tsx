'use client';

import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Palette, ImagePlus } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function BrandingPage() {
  const [form, setForm] = useState({
    name: '',
    logoUrl: '',
    primaryColor: '#2563eb',
    secondaryColor: '#1e40af',
    customDomain: '',
    requireApproval: false,
    photoRetentionDays: 90,
  });
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .branding()
      .then((b) =>
        setForm({
          name: b.name || '',
          logoUrl: b.logoUrl || '',
          primaryColor: b.primaryColor || '#2563eb',
          secondaryColor: b.secondaryColor || '#1e40af',
          customDomain: b.customDomain || '',
          requireApproval: !!b.requireApproval,
          photoRetentionDays: b.photoRetentionDays ?? 90,
        }),
      )
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.updateBranding({
        name: form.name,
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        customDomain: form.customDomain,
        requireApproval: form.requireApproval,
        photoRetentionDays: form.photoRetentionDays,
      });
      setMsg('Settings saved');
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  async function onLogo(file: File) {
    setUploading(true);
    setMsg('');
    try {
      const res = await api.uploadLogo(file);
      setForm((f) => ({ ...f, logoUrl: res.logoUrl || f.logoUrl }));
      setMsg('Logo uploaded');
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const logoSrc = form.logoUrl
    ? form.logoUrl.startsWith('http')
      ? form.logoUrl
      : `${API_URL}${form.logoUrl}`
    : null;

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin" className="rounded-full p-2 hover:bg-slate-100">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Palette size={22} /> Branding & Settings
        </h1>
      </div>

      {msg && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{msg}</p>
      )}

      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Organisation name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-xl border px-4 py-3"
          />
          <p className="mt-1 text-xs text-slate-400">
            Defaults from ORGANIZATION env on first boot; editable anytime here.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Logo</label>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border bg-slate-50">
              {logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoSrc} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <ImagePlus className="text-slate-300" size={28} />
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {uploading ? 'Uploading…' : 'Pick image'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])}
              />
              <p className="mt-1 text-xs text-slate-400">PNG or JPG, max 3MB</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Primary colour</label>
            <input
              type="color"
              value={form.primaryColor}
              onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              className="h-12 w-full cursor-pointer rounded-xl border"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Secondary colour</label>
            <input
              type="color"
              value={form.secondaryColor}
              onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
              className="h-12 w-full cursor-pointer rounded-xl border"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Custom domain</label>
          <input
            value={form.customDomain}
            onChange={(e) => setForm({ ...form, customDomain: e.target.value })}
            className="w-full rounded-xl border px-4 py-3"
            placeholder="visitors.yourorg.com"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Photo retention (days)</label>
          <input
            type="number"
            min={7}
            max={3650}
            value={form.photoRetentionDays}
            onChange={(e) =>
              setForm({ ...form, photoRetentionDays: parseInt(e.target.value) || 90 })
            }
            className="w-full rounded-xl border px-4 py-3"
          />
        </div>

        <label className="flex items-center gap-3 rounded-xl border px-4 py-3">
          <input
            type="checkbox"
            checked={form.requireApproval}
            onChange={(e) => setForm({ ...form, requireApproval: e.target.checked })}
            className="h-5 w-5"
          />
          <span className="text-sm font-medium">Require approval for invites</span>
        </label>

        <button type="submit" className="w-full rounded-xl bg-brand-600 py-3.5 font-semibold text-white">
          Save Settings
        </button>
      </form>
    </div>
  );
}
