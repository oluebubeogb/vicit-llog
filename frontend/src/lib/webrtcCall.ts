export type VoiceSignal = { type: string; sdp?: string; candidate?: any };
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

export class VoiceSession {
  pc: RTCPeerConnection | null = null;
  local: MediaStream | null = null;
  remote: MediaStream | null = null;
  callId = '';
  private queued: VoiceSignal[] = [];
  private pendingIce: RTCIceCandidateInit[] = [];
  private remoteSet = false;
  private handlers: VoiceHandlers | null = null;
  private audio: HTMLAudioElement | null = null;
  private restarting = false;

  attachAudio(el: HTMLAudioElement | null) {
    this.audio = el;
    if (el && this.remote) {
      el.srcObject = this.remote;
      playRemote(el, this.handlers?.onNeedsGesture);
    }
  }

  async start(opts: {
    callId: string;
    isCaller: boolean;
    iceServers?: RTCIceServer[] | Promise<{ iceServers?: RTCIceServer[] } | RTCIceServer[]>;
    handlers: VoiceHandlers;
    audio?: HTMLAudioElement | null;
  }) {
    const earlySignals = this.queued.splice(0);
    const earlyIce = this.pendingIce.splice(0);
    this.cleanup();
    this.queued = earlySignals;
    this.pendingIce = earlyIce;
    this.callId = opts.callId;
    this.handlers = opts.handlers;
    if (opts.audio) this.audio = opts.audio;
    this.handlers.onState?.('connecting');
    this.local = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    let servers: RTCIceServer[] = STUN;
    if (opts.iceServers) {
      const raw = await opts.iceServers;
      const list = Array.isArray(raw) ? raw : raw?.iceServers;
      if (list?.length) servers = list;
    }
    const pc = new RTCPeerConnection({ iceServers: servers });
    this.pc = pc;
    this.local.getTracks().forEach((t) => pc.addTrack(t, this.local!));
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      this.remote = stream;
      if (this.audio) {
        this.audio.srcObject = stream;
        playRemote(this.audio, this.handlers?.onNeedsGesture);
      }
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.handlers?.send({ type: 'ice', candidate: ev.candidate });
    };
    pc.onconnectionstatechange = () => this.onConnection(pc);
    pc.oniceconnectionstatechange = () => this.onConnection(pc);
    if (opts.isCaller) {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      await this.handlers.send({ type: 'offer', sdp: offer.sdp });
    }
    const pending = this.queued.splice(0);
    for (const s of pending) await this.handleSignal(s);
  }

  async handleSignal(payload: VoiceSignal) {
    if (!this.pc) {
      this.queued.push(payload);
      return;
    }
    const pc = this.pc;
    try {
      if (payload.type === 'offer' && payload.sdp) {
        await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
        this.remoteSet = true;
        await this.flushIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.handlers?.send({ type: 'answer', sdp: answer.sdp });
      } else if (payload.type === 'answer' && payload.sdp) {
        if (pc.signalingState !== 'stable') {
          await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
          this.remoteSet = true;
          await this.flushIce();
        }
      } else if (payload.type === 'ice' && payload.candidate) {
        if (!this.remoteSet) this.pendingIce.push(payload.candidate);
        else await pc.addIceCandidate(payload.candidate).catch(() => {});
      } else if (payload.type === 'hangup') {
        this.cleanup();
      }
    } catch (e: any) {
      this.handlers?.onError?.(e?.message || 'Signalling failed');
    }
  }

  private async flushIce() {
    const pc = this.pc;
    if (!pc) return;
    const batch = this.pendingIce.splice(0);
    for (const c of batch) await pc.addIceCandidate(c).catch(() => {});
  }

  private async onConnection(pc: RTCPeerConnection) {
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
    if (this.restarting || !this.pc) return;
    this.restarting = true;
    try {
      const offer = await this.pc.createOffer({ iceRestart: true, offerToReceiveAudio: true });
      await this.pc.setLocalDescription(offer);
      await this.handlers?.send({ type: 'offer', sdp: offer.sdp });
    } catch {
      /* ignore */
    } finally {
      setTimeout(() => { this.restarting = false; }, 4000);
    }
  }

  setMicMuted(muted: boolean) {
    this.local?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  }

  async enableAudio() {
    if (this.audio) await playRemote(this.audio, this.handlers?.onNeedsGesture);
  }

  cleanup() {
    this.pc?.getSenders().forEach((s) => s.track?.stop());
    this.pc?.close();
    this.pc = null;
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.remote = null;
    this.queued = [];
    this.pendingIce = [];
    this.remoteSet = false;
    this.callId = '';
    this.restarting = false;
    if (this.audio) this.audio.srcObject = null;
    this.handlers?.onState?.('closed');
  }
}

export const voiceSession = new VoiceSession();
