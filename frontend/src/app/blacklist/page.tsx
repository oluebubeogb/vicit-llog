'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Ban, Plus, ShieldCheck, ShieldOff } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Collapse from '@/components/ui/Collapse';
import StatusPill from '@/components/ui/StatusPill';
import Tooltip from '@/components/ui/Tooltip';
import { Empty, Notice, SkeletonList } from '@/components/ui/Bits';
import { relTime } from '@/lib/format';

export default function BlacklistPage() {
  const [items, setItems] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fullName: '', idNumber: '', phone: '', reason: '' });
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api
      .blacklist()
      .then(setItems)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.addBlacklist(form);
      setMsg({ tone: 'success', text: 'Added to blacklist — gate officers will be alerted on a match' });
      setShowForm(false);
      setForm({ fullName: '', idNumber: '', phone: '', reason: '' });
      load();
    } catch (err: any) {
      setMsg({ tone: 'error', text: err.message });
    }
  }

  async function deactivate(id: string) {
    await api.deactivateBlacklist(id);
    load();
  }

  const active = items.filter((i) => i.isActive);
  const lifted = items.filter((i) => !i.isActive);

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        icon={<Ban size={20} />}
        title="Blacklist"
        subtitle={loading ? 'Loading…' : `${active.length} active · ${lifted.length} lifted`}
        info="People who must not be admitted. Registrations matching a name, phone or ID are flagged at the gate and in analytics."
        actions={
          <button onClick={() => setShowForm(!showForm)} className="btn-danger !px-3">
            <Plus size={16} /> Add
          </button>
        }
      />

      {msg && (
        <Notice tone={msg.tone} onClose={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}

      <Collapse open={showForm}>
        <form onSubmit={add} className="surface mb-4 space-y-2.5 !border-rose-100">
          <p className="section-title !text-rose-600">New entry</p>
          <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="input" />
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="ID number" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} className="input" />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
          </div>
          <input placeholder="Reason (required)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="input" required />
          <button type="submit" className="btn-danger w-full">
            Add to blacklist
          </button>
        </form>
      </Collapse>

      {loading ? (
        <SkeletonList rows={4} />
      ) : items.length === 0 ? (
        <Empty icon={<ShieldCheck size={24} />} title="No blacklist entries" hint="Nobody is currently barred from entry." />
      ) : (
        <ul className="rows stagger">
          {[...active, ...lifted].map((item) => (
            <li key={item.id} className={`flex items-center gap-3 px-3.5 py-3 ${item.isActive ? '' : 'opacity-60'}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${item.isActive ? 'from-rose-100 to-rose-50 text-rose-600' : 'from-slate-100 to-slate-50 text-slate-400'}`}>
                <Ban size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-800">{item.fullName || item.idNumber || item.phone}</p>
                <p className="truncate text-xs text-rose-700/80">{item.reason}</p>
                <p className="truncate text-[11px] text-slate-400">
                  {[item.idNumber && `ID ${item.idNumber}`, item.phone, item.createdAt && `added ${relTime(item.createdAt)}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              {item.isActive ? (
                <Tooltip content="Lift this entry — the person can be admitted again">
                  <button onClick={() => deactivate(item.id)} className="btn-ghost !px-2.5 !py-1.5 !text-xs">
                    <ShieldOff size={13} /> Lift
                  </button>
                </Tooltip>
              ) : (
                <StatusPill label="Lifted" tone="slate" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
