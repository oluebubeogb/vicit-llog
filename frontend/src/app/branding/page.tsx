'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Palette } from 'lucide-react';

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
          requireApproval: b.requireApproval || false,
          photoRetentionDays: b.photoRetentionDays ?? 90,
        }),
      )
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.updateBranding(form);
      setMsg('Branding saved');
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

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
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Logo URL</label>
          <input
            value={form.logoUrl}
            onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
            className="w-full rounded-xl border px-4 py-3"
            placeholder="https://..."
          />
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
          <label className="mb-1 block text-sm font-medium">
            Photo retention (days)
          </label>
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
        <button
          type="submit"
          className="w-full rounded-xl bg-brand-600 py-3.5 font-semibold text-white"
        >
          Save Settings
        </button>
      </form>
    </div>
  );
}
