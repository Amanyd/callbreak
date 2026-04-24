// Realistic card sound effects using Web Audio API — noise-based, no external files

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

/** Lazily create AudioContext on first user interaction (avoids browser suspension) */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/** Pre-generate a reusable white noise buffer (avoids alloc + fill on every sound play) */
function getNoiseBuffer(ctx: AudioContext, durationSeconds: number): AudioBuffer {
  // Cache a single 0.5s noise buffer and reuse it everywhere
  if (noiseBuffer && noiseBuffer.length >= ctx.sampleRate * durationSeconds) {
    return noiseBuffer;
  }
  const bufferSize = Math.ceil(ctx.sampleRate * 0.5); // 0.5s covers all use cases
  noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Create a short burst of filtered noise (simulates card snap/slide) */
function playNoiseBurst(
  duration: number,
  highpass: number,
  lowpass: number,
  volume: number,
  startTime?: number,
) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = startTime ?? ctx.currentTime;

  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx, duration);

  // Highpass to remove rumble
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = highpass;

  // Lowpass to shape the "thud" vs "snap"
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lowpass;

  // Envelope
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  source.connect(hp);
  hp.connect(lp);
  lp.connect(gain);
  gain.connect(ctx.destination);

  source.start(t);
  source.stop(t + duration);
}

/** Card throw / place on table — short snappy "thwack" */
export function playCardThrow() {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Sharp attack noise burst — sounds like card hitting table
  playNoiseBurst(0.08, 2000, 8000, 0.25);

  // Subtle low "thud" layered underneath
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.05);
  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.06);
}

/** Trick win — cards sliding / scooping sound */
export function playTrickWin() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx, 0.3);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(800, ctx.currentTime);
  bp.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.15);
  bp.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.3);
  bp.Q.value = 1.5;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

  source.connect(bp);
  bp.connect(gain);
  gain.connect(ctx.destination);

  source.start(ctx.currentTime);
  source.stop(ctx.currentTime + 0.3);
}

/** Bid place — subtle card tap */
export function playBidPlace() {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Very short crisp tap
  playNoiseBurst(0.04, 3000, 7000, 0.15);
}

/** Trick slide — cards sweeping across table to winner */
export function playTrickSlide() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx, 0.4);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(400, ctx.currentTime);
  bp.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.25);
  bp.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.4);
  bp.Q.value = 1.0;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
  gain.gain.setValueAtTime(0.2, ctx.currentTime + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

  source.connect(bp);
  bp.connect(gain);
  gain.connect(ctx.destination);

  source.start(ctx.currentTime);
  source.stop(ctx.currentTime + 0.4);
}

/** Card deal / distribute — rapid flutter */
export function playCardDeal() {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Quick series of tiny snaps
  for (let i = 0; i < 3; i++) {
    const t = ctx.currentTime + i * 0.04;
    playNoiseBurst(0.03, 2500, 9000, 0.08 + i * 0.03, t);
  }
}

let bgMusic: HTMLAudioElement | null = null;

/** Start background music on loop */
export function startBackgroundMusic() {
  if (bgMusic) return; // already playing
  
  bgMusic = new Audio('/music/down_marian_hill.mp3');
  bgMusic.loop = true;
  bgMusic.volume = 0.25; // lower volume for background
  
  bgMusic.play().catch(err => {
    console.warn('Auto-play blocked or audio failed:', err);
    // Setting bgMusic to null so it can be tried again on next interaction
    bgMusic = null;
  });
}

/** Modern minimal button click — ultra-short crisp "tick" */
export function playButtonClick() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const t = ctx.currentTime;

  // Ultra-short high-frequency "tick" — like a modern UI tap
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = 4800;
  gain.gain.setValueAtTime(0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.008);
  osc.start(t);
  osc.stop(t + 0.01);

  // Subtle low "pop" for weight
  const pop = ctx.createOscillator();
  const popGain = ctx.createGain();
  pop.connect(popGain);
  popGain.connect(ctx.destination);
  pop.type = 'sine';
  pop.frequency.value = 600;
  popGain.gain.setValueAtTime(0.04, t);
  popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
  pop.start(t);
  pop.stop(t + 0.02);
}

/** Trigger haptic feedback on supported devices */
export function triggerHaptic(durationMs: number = 10) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(durationMs);
  }
}

/** Attach global click sound + haptic to all <button> elements (call once at app init) */
export function initButtonSounds() {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      playButtonClick();
      triggerHaptic(10);
    }
  }, { passive: true });
}
