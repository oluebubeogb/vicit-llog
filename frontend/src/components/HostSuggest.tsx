'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';

export type HostPick = { id: string; fullName: string; role?: string; organisation?: { name?: string } | null; email?: string };

export default function HostSuggest({
  organisationId,
  contractorId,
  value,
  onChange,
  label = 'Who do you want to see?',
  placeholder = 'Search staff by name…',
  required,
}: {
  organisationId?: string;
  contractorId?: string;
  value: HostPick | null;
  onChange: (host: HostPick | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [q, setQ] = useState(value?.fullName || '');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<HostPick[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value?.fullName && value.fullName !== q) setQ(value.fullName);
  }, [value?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (value && q === value.fullName) { setRows([]); return; }
    const t = setTimeout(() => {
      api.directoryHosts(organisationId, q.trim() || undefined, contractorId)
        .then((list) => setRows(Array.isArray(list) ? list.slice(0, 12) : []))
        .catch(() => setRows([]));
    }, 180);
    return () => clearTimeout(t);
  }, [q, organisationId, contractorId, value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <label className="block">
      <span className="label">{label}</span>
      <div ref={box} className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9 pr-9"
          value={q}
          required={required && !value}
          placeholder={placeholder}
          onChange={(e) => { setQ(e.target.value); onChange(null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        {value && (
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Clear host" onClick={() => { setQ(''); onChange(null); }}>
            <X size={14} />
          </button>
        )}
        {open && rows.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            {rows.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-brand-50"
                  onClick={() => { onChange(h); setQ(h.fullName); setOpen(false); }}
                >
                  <b className="text-slate-900">{h.fullName}</b>
                  <span className="text-[11px] text-slate-500">{[h.role, h.organisation?.name, h.email].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </label>
  );
}
