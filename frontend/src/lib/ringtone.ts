/** Loud looping telephone ring. Call stopRingtone on answer, decline, or timeout. */

let ctx: AudioContext | null = null;
let timer: number | null = null;
let oscillators: OscillatorNode[] = [];
let gain: GainNode | null = null;

function context() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Resume audio after a user gesture so later rings are audible without another tap. */
export function unlockRingtone() {
  const c = context();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function ringtonePlaying() {
  return timer != null;
}

export function startRingtone() {
  stopRingtone();
  const c = context();
  if (!c) return false;
  c.resume().catch(() => {});
  gain = c.createGain();
  gain.gain.value = 0.0001;
  gain.connect(c.destination);
  const o1 = c.createOscillator();
  const o2 = c.createOscillator();
  o1.type = 'sine';
  o2.type = 'sine';
  o1.frequency.value = 440;
  o2.frequency.value = 480;
  o1.connect(gain);
  o2.connect(gain);
  o1.start();
  o2.start();
  oscillators = [o1, o2];

  const waits = [420, 180, 420, 1500];
  let step = 0;
  const tick = () => {
    const on = step % 2 === 0;
    const now = c.currentTime;
    gain?.gain.cancelScheduledValues(now);
    gain?.gain.setValueAtTime(gain.gain.value, now);
    gain?.gain.linearRampToValueAtTime(on ? 0.45 : 0.0001, now + 0.03);
    if (on) {
      try { navigator.vibrate?.([280, 80, 280]); } catch { /* unsupported */ }
    }
    const wait = waits[step % waits.length];
    step += 1;
    timer = window.setTimeout(tick, wait);
  };
  tick();
  return c.state === 'running';
}

export function stopRingtone() {
  if (timer != null) window.clearTimeout(timer);
  timer = null;
  try { navigator.vibrate?.(0); } catch { /* ignore */ }
  for (const osc of oscillators) {
    try { osc.stop(); } catch { /* already stopped */ }
  }
  oscillators = [];
  try { gain?.disconnect(); } catch { /* ignore */ }
  gain = null;
}

/**
 * v31: short "double tune" for a new in-app notification (two rising notes, ~0.45 s).
 * Uses the same AudioContext as the ringtone, so the existing tap-to-unlock applies.
 * Never plays over a ringing call.
 */
export function playChime() {
  if (timer != null) return false;
  const c = context();
  if (!c) return false;
  if (c.state === 'suspended') c.resume().catch(() => {});
  if (c.state !== 'running') return false;
  const notes: Array<[number, number]> = [[880, 0], [1318.5, 0.2]];
  for (const [freq, at] of notes) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t0 = c.currentTime + at;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.32, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + 0.26);
  }
  try { navigator.vibrate?.([120, 80, 120]); } catch { /* unsupported */ }
  return true;
}
