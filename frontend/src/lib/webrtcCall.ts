export type VoiceSignal = { type: string; sdp?: string; candidate?: any; callId?: string };
export type VoiceState = 'idle' | 'connecting' | 'connected' | 'poor' | 'failed' | 'closed';

export type VoiceHandlers = {
  send: (payload: VoiceSignal) => Promise<void> | void;
  onState?: (state: VoiceState) => void;
  onNeedsGesture?: (needed: boolean) => void;
  onError?: (message: string) => void;
};

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

async function playRemote(audio: HTMLAudioElement | null, onNeedsGesture?: (n: boolean) => void) {
  if (!audio) return;
  audio.autoplay = true;
  audio.setAttribute('playsinline', 'true');
  audio.muted = false;
  const attempt = async (n: number) => {
    try {
      await audio.play();
      onNeedsGesture?.(false);
    } catch {
      if (n < 4) setTimeout(() => attempt(n + 1), 250 * n);
      else onNeedsGesture?.(true);
    }
  };
  await attempt(1);
}

type QueuedSignal = VoiceSignal & { callId?: string };

export class VoiceSession {
  pc: RTCPeerConnection | null = null;
  local: MediaStream | null = null;
  remote: MediaStream | null = null;
  callId = '';
  private queued: QueuedSignal[] = [];
  private pendingIce: RTCIceCandidateInit[] = [];
  private remoteSet = false;
  private handlers: VoiceHandlers | null = null;
  private audio: HTMLAudioElement | null = null;
  private restarting = false;
  private makingOffer = false;
  /** Callee is the polite peer (rolls back on glare). Caller is impolite and ignores colliding offers. */
  private polite = false;
  private generation = 0;
  private startingCallId = '';
  private lastOfferSdp = '';
  private lastAnswerSdp = '';
  private closed = true;

  attachAudio(el: HTMLAudioElement | null) {
    this.audio = el;
    if (el && this.remote) {
      el.srcObject = this.remote;
      playRemote(el, this.handlers?.onNeedsGesture);
    }
  }

  private belongsToCurrentCall(callId?: string) {
    if (!callId) return true;
    const current = this.callId || this.startingCallId;
    if (!current) return true;
    return callId === current;
  }

  async start(opts: {
    callId: string;
    isCaller: boolean;
    iceServers?: RTCIceServer[] | Promise<{ iceServers?: RTCIceServer[] } | RTCIceServer[]>;
    handlers: VoiceHandlers;
    audio?: HTMLAudioElement | null;
  }) {
    this.startingCallId = opts.callId;
    const earlySignals = this.queued.filter((s) => this.belongsToCall(s.callId, opts.callId));
    const earlyIce = this.pendingIce.splice(0);
    this.queued = [];
    this.cleanup({ keepStarting: true });
    this.generation += 1;
    const gen = this.generation;
    this.queued = earlySignals;
    this.pendingIce = earlyIce;
    this.callId = opts.callId;
    this.startingCallId = opts.callId;
    this.polite = !opts.isCaller;
    this.handlers = opts.handlers;
    this.closed = false;
    if (opts.audio) this.audio = opts.audio;
    this.handlers.onState?.('connecting');
    try {
      this.local = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      if (gen !== this.generation) return;
      throw e;
    }
    if (gen !== this.generation || this.closed) {
      this.local?.getTracks().forEach((t) => t.stop());
      this.local = null;
      return;
    }
    let servers: RTCIceServer[] = STUN;
    if (opts.iceServers) {
      const raw = await opts.iceServers;
      if (gen !== this.generation || this.closed) return;
      const list = Array.isArray(raw) ? raw : raw?.iceServers;
      if (list?.length) servers = list;
    }
    const pc = new RTCPeerConnection({ iceServers: servers });
    if (gen !== this.generation || this.closed) {
      pc.close();
      return;
    }
    this.pc = pc;
    this.local.getTracks().forEach((t) => pc.addTrack(t, this.local!));
    pc.ontrack = (ev) => {
      if (gen !== this.generation) return;
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      this.remote = stream;
      if (this.audio) {
        this.audio.srcObject = stream;
        playRemote(this.audio, this.handlers?.onNeedsGesture);
      }
    };
    pc.onicecandidate = (ev) => {
      if (gen !== this.generation || this.closed) return;
      if (ev.candidate) this.handlers?.send({ type: 'ice', candidate: ev.candidate });
    };
    pc.onconnectionstatechange = () => { if (gen === this.generation) this.onConnection(pc); };
    pc.oniceconnectionstatechange = () => { if (gen === this.generation) this.onConnection(pc); };
    if (opts.isCaller) {
      try {
        this.makingOffer = true;
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        if (gen !== this.generation || this.pc !== pc) return;
        await pc.setLocalDescription(offer);
        if (gen !== this.generation || this.pc !== pc) return;
        await this.handlers.send({ type: 'offer', sdp: offer.sdp });
      } finally {
        this.makingOffer = false;
      }
    }
    const pending = this.queued.splice(0);
    for (const s of pending) {
      if (gen !== this.generation) return;
      await this.handleSignal(s, s.callId || opts.callId);
    }
    this.startingCallId = '';
  }

  private belongsToCall(signalCallId: string | undefined, callId: string) {
    return !signalCallId || signalCallId === callId;
  }

  async handleSignal(payload: VoiceSignal, callId?: string) {
    const cid = callId || payload.callId;
    if (!this.belongsToCurrentCall(cid)) return;
    if (!this.pc) {
      // After hangup, ignore late untagged signals from the previous call so they
      // cannot be replayed onto the next peer connection (the first-callback glare bug).
      if (!this.startingCallId && !this.callId && !cid) return;
      this.queued.push({ ...payload, callId: cid });
      return;
    }
    const pc = this.pc;
    const gen = this.generation;
    try {
      if (payload.type === 'offer' && payload.sdp) {
        if (pc.remoteDescription?.type === 'offer' && pc.remoteDescription.sdp === payload.sdp) return;
        if (this.lastOfferSdp && this.lastOfferSdp === payload.sdp && pc.signalingState === 'stable') return;

        const offerCollision = this.makingOffer || pc.signalingState !== 'stable';
        if (offerCollision) {
          if (!this.polite) return; // impolite (caller) ignores colliding remote offers
          try {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setLocalDescription({ type: 'rollback' });
            }
          } catch {
            /* some browsers reject rollback; continue if we can still apply the offer */
          }
        }
        if (gen !== this.generation || this.pc !== pc) return;
        await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
        this.lastOfferSdp = payload.sdp;
        this.remoteSet = true;
        await this.flushIce();
        if (gen !== this.generation || this.pc !== pc) return;
        if (pc.signalingState !== 'have-remote-offer') return;
        const answer = await pc.createAnswer();
        if (gen !== this.generation || this.pc !== pc) return;
        if (pc.signalingState !== 'have-remote-offer') return;
        await pc.setLocalDescription(answer);
        this.lastAnswerSdp = answer.sdp || '';
        await this.handlers?.send({ type: 'answer', sdp: answer.sdp });
      } else if (payload.type === 'answer' && payload.sdp) {
        if (pc.remoteDescription?.type === 'answer' && pc.remoteDescription.sdp === payload.sdp) return;
        if (this.lastAnswerSdp && this.lastAnswerSdp === payload.sdp && pc.signalingState === 'stable') return;
        if (pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
        this.lastAnswerSdp = payload.sdp;
        this.remoteSet = true;
        await this.flushIce();
      } else if (payload.type === 'ice' && payload.candidate) {
        if (!this.remoteSet) this.pendingIce.push(payload.candidate);
        else await pc.addIceCandidate(payload.candidate).catch(() => {});
      } else if (payload.type === 'hangup') {
        this.cleanup();
      }
    } catch (e: any) {
      const msg = String(e?.message || e || 'Signalling failed');
      // Glare / late SDP after a new call should never surface as a fatal overlay error.
      if (/wrong state|invalid state|called in wrong state/i.test(msg)) return;
      this.handlers?.onError?.(msg);
    }
  }

  private async flushIce() {
    const pc = this.pc;
    if (!pc) return;
    const batch = this.pendingIce.splice(0);
    for (const c of batch) await pc.addIceCandidate(c).catch(() => {});
  }

  private async onConnection(pc: RTCPeerConnection) {
    if (this.pc !== pc || this.closed) return;
    const ice = pc.iceConnectionState;
    const conn = pc.connectionState;
    if (conn === 'connected' || ice === 'connected' || ice === 'completed') this.handlers?.onState?.('connected');
    else if (conn === 'connecting' || ice === 'checking' || ice === 'new') this.handlers?.onState?.('connecting');
    else if (ice === 'disconnected') {
      this.handlers?.onState?.('poor');
      this.tryRestart();
    } else if (conn === 'failed' || ice === 'failed') {
      this.handlers?.onState?.('failed');
      this.tryRestart();
    } else if (conn === 'closed' || ice === 'closed') this.handlers?.onState?.('closed');
  }

  private async tryRestart() {
    if (this.restarting || !this.pc || this.closed) return;
    if (this.pc.signalingState !== 'stable') return;
    this.restarting = true;
    const pc = this.pc;
    const gen = this.generation;
    try {
      this.makingOffer = true;
      const offer = await pc.createOffer({ iceRestart: true, offerToReceiveAudio: true });
      if (gen !== this.generation || this.pc !== pc || this.closed) return;
      if (pc.signalingState !== 'stable') return;
      await pc.setLocalDescription(offer);
      if (gen !== this.generation || this.pc !== pc || this.closed) return;
      await this.handlers?.send({ type: 'offer', sdp: offer.sdp });
    } catch {
      /* ignore */
    } finally {
      this.makingOffer = false;
      setTimeout(() => { this.restarting = false; }, 4000);
    }
  }

  setMicMuted(muted: boolean) {
    this.local?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  }

  async enableAudio() {
    if (this.audio) await playRemote(this.audio, this.handlers?.onNeedsGesture);
  }

  cleanup(opts?: { keepStarting?: boolean }) {
    this.closed = true;
    this.pc?.getSenders().forEach((s) => s.track?.stop());
    try { this.pc?.close(); } catch { /* already closed */ }
    this.pc = null;
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.remote = null;
    this.queued = [];
    this.pendingIce = [];
    this.remoteSet = false;
    this.callId = '';
    if (!opts?.keepStarting) this.startingCallId = '';
    this.restarting = false;
    this.makingOffer = false;
    this.lastOfferSdp = '';
    this.lastAnswerSdp = '';
    if (this.audio) this.audio.srcObject = null;
    this.handlers?.onState?.('closed');
  }
}

export const voiceSession = new VoiceSession();
