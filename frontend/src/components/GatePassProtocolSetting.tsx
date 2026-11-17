'use client';

import { useEffect, useState } from 'react';
import { Check, IdCard, Loader2, Tag, Ban } from 'lucide-react';
import { api } from '@/lib/api';
import { PROTOCOL_OPTIONS, type GatePassProtocol } from '@/components/GatePass';

const ICON: Record<GatePassProtocol, any> = { PLAIN_TAGS: Tag, PRINTED_PASS: IdCard, NONE: Ban };

/** Platform settings · Gate pass protocol (one platform-wide choice; Super Admin edits, others read). */
export default function GatePassProtocolSetting({ editable }: { editable: boolean }) {
  const [current, setCurrent] = useState<GatePassProtocol | null>(null);
  const [pick, setPick] = useState<GatePassProtocol | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  useEffect(() => { api.passProtocol().then((r: any) => { setCurrent(r.protocol); setPick(r.protocol); }).catch(() => setCurrent('NONE')); }, []);
  const save = async () => {
    if (!pick) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.setPassProtocol(pick);
      setCurrent(r.protocol);
      setMsg({ tone: 'ok', text: `Saved — every gate now uses ${PROTOCOL_OPTIONS.find((o) => o.v === r.protocol)?.short.toLowerCase()}.${r.outstanding ? ` ${r.outstanding} item${r.outstanding === 1 ? '' : 's'} issued earlier must still be closed at exit.` : ''}` });
    } catch (e: any) { setMsg({ tone: 'err', text: e?.message || 'Could not save' }); }
    finally { setBusy(false); }
  };
  return (
    <section className="surface animate-in space-y-3" data-testid="gate-pass-protocol-setting">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><IdCard size={16} className="text-brand-600" /> Gate pass protocol</h2>
          <p className="mt-0.5 text-xs text-slate-500">Platform-wide · applies to every agency, gate, mobile checkpoint and the Visits page</p>
        </div>
        {current && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">Live: {PROTOCOL_OPTIONS.find((o) => o.v === current)?.short}</span>}
      </div>
      {!current ? <div className="flex justify-center py-6"><Loader2 className="animate-spin text-slate-400" /></div> : (
        <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Gate pass protocol">
          {PROTOCOL_OPTIONS.map((o) => {
            const Icon = ICON[o.v];
            const on = pick === o.v;
            return (
              <button key={o.v} type="button" role="radio" aria-checked={on} disabled={!editable} onClick={() => setPick(o.v)}
                className={`group relative flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition ${on ? 'border-brand-400 bg-gradient-to-br from-brand-50 to-white shadow-soft ring-2 ring-brand-200' : 'border-slate-200 bg-white hover:border-slate-300'} ${editable ? '' : 'cursor-default'}`}>
                <span className="flex w-full items-center gap-2">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}><Icon size={17} /></span>
                  <b className="flex-1 text-sm text-slate-900">{o.title}</b>
                  {on && <Check size={16} className="text-brand-600" />}
                </span>
                <span className="text-[11.5px] leading-relaxed text-slate-600">{o.body}</span>
              </button>
            );
          })}
        </div>
      )}
      {msg && <p className={`rounded-xl px-3 py-2 text-xs font-medium ${msg.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{msg.text}</p>}
      {editable ? (
        <div className="flex items-center justify-end gap-2">
          {pick !== current && <button type="button" className="btn-quiet !py-2 text-xs" onClick={() => setPick(current)}>Cancel</button>}
          <button type="button" className="btn-primary !py-2 text-sm" disabled={busy || !pick || pick === current} onClick={save} data-testid="save-pass-protocol">{busy ? 'Saving…' : 'Save protocol'}</button>
        </div>
      ) : <p className="text-[11px] text-slate-400">Only the Super Admin can change this.</p>}
    </section>
  );
}
