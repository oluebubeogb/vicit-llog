'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BellRing, Mic, MicOff, Phone, PhoneOff, X } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { startRingtone, stopRingtone, unlockRingtone } from '@/lib/ringtone';

type Call = {
  id: string;
  status: string;
  direction: string;
  youAre: 'caller' | 'callee';
  visitor?: { id?: string; fullName?: string; purpose?: string | null } | null;
  dispatch?: { id?: string; courierName?: string; courierCompany?: string | null } | null;
  gate?: { name?: string; location?: string | null } | null;
  from?: { fullName?: string; role?: string; phone?: string | null } | null;
  to?: { fullName?: string; role?: string; phone?: string | null } | null;
  phone?: string | null;
  answeredAt?: string | null;
};

const LABEL: Record<string, string> = {
  RINGING: 'Ringing',
  ACCEPTED: 'On the line',
  DECLINED: 'Declined',
  BUSY: 'Busy',
  MISSED: 'No answer',
  CANCELLED: 'Cancelled',
  ENDED: 'Call ended',
};

function publish(call: Call | null) {
  window.dispatchEvent(new CustomEvent('vicit:ring', { detail: call }));
}

function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function RingOverlay() {
  const pathname = usePathname();
  const [call, setCall] = useState<Call | null>(null);
  const [busy, setBusy] = useState('');
  const [muted, setMuted] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const startedFor = useRef<string | null>(null);

  const focus = useCallback(async (id: string) => {
    try {
      const next = await api.ring(id);
      setCall(next);
      publish(next);
    } catch {
      /* the ring may have expired */
    }
  }, []);

  const hangupVoice = useCallback(() => {
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    startedFor.current = null;
  }, []);

  const startVoice = useCallback(async (current: Call) => {
    if (startedFor.current === current.id && pcRef.current) return;
    hangupVoice();
    startedFor.current = current.id;
    setVoiceError('');
    try {
      const { iceServers } = await api.ringIceServers();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localRef.current = stream;
      const pc = new RTCPeerConnection({ iceServers: iceServers?.length ? iceServers : [{ urls: 'stun:stun.l.google.com:19302' }] });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.ontrack = (ev) => {
        const audio = remoteAudioRef.current;
        if (!audio) return;
        audio.srcObject = ev.streams[0] || new MediaStream([ev.track]);
        audio.play().catch(() => {});
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) api.ringSignal(current.id, { type: 'ice', candidate: ev.candidate }).catch(() => {});
      };
      if (current.youAre === 'caller') {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        await api.ringSignal(current.id, { type: 'offer', sdp: offer.sdp });
      }
    } catch (e: any) {
      setVoiceError(e?.message || 'Microphone access is needed for a live voice call. A TURN server may be required on strict networks.');
    }
  }, [hangupVoice]);

  const onSignal = useCallback(async (payload: any, callId: string) => {
    const pc = pcRef.current;
    if (!pc || startedFor.current !== callId) return;
    try {
      if (payload.type === 'offer' && payload.sdp) {
        await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await api.ringSignal(callId, { type: 'answer', sdp: answer.sdp });
      } else if (payload.type === 'answer' && payload.sdp) {
        if (pc.signalingState !== 'stable') await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      } else if (payload.type === 'ice' && payload.candidate) {
        await pc.addIceCandidate(payload.candidate).catch(() => {});
      } else if (payload.type === 'hangup') {
        hangupVoice();
      }
    } catch {
      /* ignore late signals */
    }
  }, [hangupVoice]);

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
          if (data?.type === 'signal' && data.payload) onSignal(data.payload, data.callId);
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
  }, [pathname, onSignal]);

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

  useEffect(() => {
    if (call?.status === 'ACCEPTED') startVoice(call);
    if (call && !['RINGING', 'ACCEPTED'].includes(call.status)) hangupVoice();
  }, [call, startVoice, hangupVoice]);

  useEffect(() => {
    if (call?.status !== 'ACCEPTED') { setElapsed(0); return; }
    const started = call.answeredAt ? new Date(call.answeredAt).getTime() : Date.now();
    const tick = () => setElapsed(Date.now() - started);
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [call?.id, call?.status, call?.answeredAt]);

  useEffect(() => () => hangupVoice(), [hangupVoice]);

  async function act(action: 'accept' | 'decline' | 'busy' | 'cancel' | 'hangup') {
    if (!call) return;
    setBusy(action);
    try {
      const next = await api.ringAction(call.id, action);
      if (action === 'hangup') hangupVoice();
      setCall(next);
      publish(next);
    } catch {
      setCall((c) => (c ? { ...c, status: action === 'hangup' ? 'ENDED' : 'MISSED' } : c));
      if (action === 'hangup') hangupVoice();
    } finally {
      setBusy('');
    }
  }

  function toggleMic() {
    const next = !micMuted;
    setMicMuted(next);
    localRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
  }

  if (!call) return null;
  const open = ['RINGING', 'ACCEPTED', 'DECLINED', 'BUSY', 'MISSED', 'ENDED', 'CANCELLED'].includes(call.status);
  if (!open) return null;
  const incoming = call.youAre === 'callee';
  const who = incoming ? call.from?.fullName : call.to?.fullName;
  const place = [call.gate?.name, call.gate?.location].filter(Boolean).join(' · ');
  const phone = call.phone;
  const showCall = !!phone && (call.status !== 'RINGING' || incoming);
  const subject = call.dispatch?.courierName || call.visitor?.fullName;
  const live = call.status === 'ACCEPTED';

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Ring">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white ${call.status === 'RINGING' ? 'animate-pulse bg-amber-500' : live ? 'bg-emerald-500' : 'bg-slate-400'}`}>
              <BellRing size={22} />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{LABEL[call.status] || call.status}</p>
              <p className="text-lg font-bold text-slate-900">{who || 'Gate'}</p>
              <p className="text-xs text-slate-500">{[subject, place || call.visitor?.purpose || call.dispatch?.courierCompany].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <button type="button" aria-label="Close" className="rounded-full p-2 text-slate-400 hover:bg-slate-100" onClick={() => { stopRingtone(); if (live) act('hangup'); else { hangupVoice(); setCall(null); } }}>
            <X size={18} />
          </button>
        </div>

        {muted && call.status === 'RINGING' && (
          <button type="button" className="btn-primary mb-3 w-full" onClick={() => { unlockRingtone(); startRingtone(); setMuted(false); }}>
            Tap to hear
          </button>
        )}

        {live && (
          <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-center">
            <p className="font-mono text-2xl font-bold tabular-nums text-emerald-800">{formatElapsed(elapsed)}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Live voice</p>
            {voiceError && <p className="mt-2 text-xs text-amber-700">{voiceError}</p>}
          </div>
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
        {live && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={toggleMic} className="btn-quiet inline-flex items-center justify-center gap-2 !py-3">
              {micMuted ? <MicOff size={16} /> : <Mic size={16} />} {micMuted ? 'Unmute' : 'Mute'}
            </button>
            <button type="button" disabled={!!busy} onClick={() => act('hangup')} className="btn-danger inline-flex items-center justify-center gap-2 !py-3">
              <PhoneOff size={16} /> Hang up
            </button>
          </div>
        )}
        {!live && call.status !== 'RINGING' && <p className="rounded-xl bg-slate-50 px-3 py-2 text-center text-sm font-semibold text-slate-700">{LABEL[call.status]}</p>}

        {showCall && !live && (
          <a href={`tel:${phone}`} className="btn-primary mt-3 w-full">
            <Phone size={16} /> Call
          </a>
        )}
      </div>
    </div>
  );
}
