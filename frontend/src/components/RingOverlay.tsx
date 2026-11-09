'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BellRing, Phone, PhoneOff, X } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { startRingtone, stopRingtone, unlockRingtone } from '@/lib/ringtone';

type Call = {
  id: string;
  status: string;
  direction: string;
  youAre: 'caller' | 'callee';
  visitor?: { id?: string; fullName?: string; purpose?: string | null };
  gate?: { name?: string; location?: string | null } | null;
  from?: { fullName?: string; role?: string; phone?: string | null } | null;
  to?: { fullName?: string; role?: string; phone?: string | null } | null;
  phone?: string | null;
};

const LABEL: Record<string, string> = {
  RINGING: 'Ringing',
  ACCEPTED: 'Answered',
  DECLINED: 'Declined',
  BUSY: 'Busy',
  MISSED: 'No answer',
  CANCELLED: 'Cancelled',
};

function publish(call: Call | null) {
  window.dispatchEvent(new CustomEvent('vicit:ring', { detail: call }));
}

export default function RingOverlay() {
  const pathname = usePathname();
  const [call, setCall] = useState<Call | null>(null);
  const [busy, setBusy] = useState('');
  const [muted, setMuted] = useState(false);

  const focus = useCallback(async (id: string) => {
    try {
      const next = await api.ring(id);
      setCall(next);
      publish(next);
    } catch {
      /* the ring may have expired */
    }
  }, []);

  useEffect(() => {
    const unlock = () => unlockRingtone();
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    let source: EventSource | null = null;
    let stopped = false;
    const connect = () => {
      if (stopped || !getToken()) return;
      source = new EventSource(api.ringStreamUrl());
      source.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data?.type === 'ring' && data.call) {
            setCall(data.call);
            publish(data.call);
          }
        } catch { /* ignore keepalives that are not JSON */ }
      };
      source.onerror = () => {
        source?.close();
        if (!stopped) window.setTimeout(connect, 4000);
      };
    };
    connect();
    api.activeRing().then((r) => { if (r?.call) { setCall(r.call); publish(r.call); } }).catch(() => {});
    return () => {
      stopped = true;
      source?.close();
    };
  }, [pathname]);

  useEffect(() => {
    const onPush = (ev: MessageEvent) => {
      const data = ev.data || {};
      if (data.type === 'PUSH' && data.callId) focus(String(data.callId));
      if (data.type === 'RING' && data.callId) focus(String(data.callId));
    };
    const onLocal = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      if (detail?.id) setCall(detail);
    };
    navigator.serviceWorker?.addEventListener('message', onPush);
    window.addEventListener('vicit:ring-local', onLocal);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onPush);
      window.removeEventListener('vicit:ring-local', onLocal);
    };
  }, [focus]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('call');
    if (pathname === '/ring' && id) focus(id);
  }, [pathname, focus]);

  useEffect(() => {
    if (call?.status === 'RINGING') {
      const playing = startRingtone();
      setMuted(!playing);
    } else {
      stopRingtone();
      setMuted(false);
    }
    return () => stopRingtone();
  }, [call?.id, call?.status]);

  async function act(action: 'accept' | 'decline' | 'busy' | 'cancel') {
    if (!call) return;
    setBusy(action);
    try {
      const next = await api.ringAction(call.id, action);
      setCall(next);
      publish(next);
    } catch (e: any) {
      setCall((c) => (c ? { ...c, status: 'MISSED' } : c));
    } finally {
      setBusy('');
    }
  }

  if (!call) return null;
  const open = call.status === 'RINGING' || call.status === 'ACCEPTED' || call.status === 'DECLINED' || call.status === 'BUSY' || call.status === 'MISSED';
  if (!open) return null;
  const incoming = call.youAre === 'callee';
  const who = incoming ? call.from?.fullName : call.to?.fullName;
  const place = [call.gate?.name, call.gate?.location].filter(Boolean).join(' · ');
  const phone = call.phone;
  const showCall = !!phone && (call.status !== 'RINGING' || incoming);

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Ring">
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white ${call.status === 'RINGING' ? 'animate-pulse bg-amber-500' : call.status === 'ACCEPTED' ? 'bg-emerald-500' : 'bg-slate-400'}`}>
              <BellRing size={22} />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{LABEL[call.status] || call.status}</p>
              <p className="text-lg font-bold text-slate-900">{who || 'Gate'}</p>
              <p className="text-xs text-slate-500">{[call.visitor?.fullName, place || call.visitor?.purpose].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <button type="button" aria-label="Close" className="rounded-full p-2 text-slate-400 hover:bg-slate-100" onClick={() => { stopRingtone(); setCall(null); }}>
            <X size={18} />
          </button>
        </div>

        {muted && call.status === 'RINGING' && (
          <button type="button" className="btn-primary mb-3 w-full" onClick={() => { unlockRingtone(); startRingtone(); setMuted(false); }}>
            Tap to hear
          </button>
        )}

        {call.status === 'RINGING' && incoming && (
          <div className="grid grid-cols-3 gap-2">
            <button type="button" disabled={!!busy} onClick={() => act('accept')} className="btn-success !px-2 !py-3 text-xs">Answer</button>
            <button type="button" disabled={!!busy} onClick={() => act('decline')} className="btn-danger !px-2 !py-3 text-xs">Decline</button>
            <button type="button" disabled={!!busy} onClick={() => act('busy')} className="btn-quiet !px-2 !py-3 text-xs">Busy</button>
          </div>
        )}
        {call.status === 'RINGING' && !incoming && (
          <button type="button" disabled={!!busy} onClick={() => act('cancel')} className="btn-quiet w-full">
            <PhoneOff size={15} /> Cancel
          </button>
        )}
        {call.status !== 'RINGING' && <p className="rounded-xl bg-slate-50 px-3 py-2 text-center text-sm font-semibold text-slate-700">{LABEL[call.status]}</p>}

        {showCall && (
          <a href={`tel:${phone}`} className="btn-primary mt-3 w-full">
            <Phone size={16} /> Call
          </a>
        )}
      </div>
    </div>
  );
}
