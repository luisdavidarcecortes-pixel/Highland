'use client';

let audioCtx: AudioContext | null = null;
let variant = 0;

/**
 * Plays a short synthesized "page turn" sound (no external files).
 * Two variants alternate on every call so fast flipping doesn't sound
 * like a stuck machine.
 */
export function playFlipSound() {
  try {
    if (!audioCtx) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctx();
    }
    const ctx = audioCtx;
    if (!ctx) return;

    if (ctx.state === 'suspended') void ctx.resume();

    variant = (variant + 1) % 2;
    const dur = variant === 0 ? 0.18 : 0.22;
    const baseFreq = variant === 0 ? 2400 : 1500;
    const sweep = variant === 1;

    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      // Noise with a soft envelope: simulates a sliding page
      data[i] = (Math.random() * 2 - 1) * (1 - t) * (t < 0.25 ? t / 0.25 : 1);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = baseFreq;
    filter.Q.value = 0.8;
    if (sweep) {
      filter.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(baseFreq * 0.45, ctx.currentTime + dur);
    }

    const gain = ctx.createGain();
    gain.gain.value = variant === 0 ? 0.15 : 0.12;

    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  } catch {
    // stay silent if the browser blocks audio
  }
}
