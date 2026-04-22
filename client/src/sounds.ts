// Realistic card sound effects using Web Audio API — noise-based, no external files
const audioCtx = typeof window !== 'undefined' ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;

function ensureContext() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

/** Create a short burst of filtered noise (simulates card snap/slide) */
function playNoiseBurst(
  duration: number,
  highpass: number,
  lowpass: number,
  volume: number,
  startTime?: number,
) {
  if (!audioCtx) return;
  const t = startTime ?? audioCtx.currentTime;

  // White noise buffer
  const bufferSize = Math.ceil(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;

  // Highpass to remove rumble
  const hp = audioCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = highpass;

  // Lowpass to shape the "thud" vs "snap"
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lowpass;

  // Envelope
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  source.connect(hp);
  hp.connect(lp);
  lp.connect(gain);
  gain.connect(audioCtx.destination);

  source.start(t);
  source.stop(t + duration);
}

/** Card throw / place on table — short snappy "thwack" */
export function playCardThrow() {
  ensureContext();
  if (!audioCtx) return;

  // Sharp attack noise burst — sounds like card hitting table
  playNoiseBurst(0.08, 2000, 8000, 0.25);

  // Subtle low "thud" layered underneath
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.05);
  gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.06);
}

/** Trick win — cards sliding / scooping sound */
export function playTrickWin() {
  ensureContext();
  if (!audioCtx) return;

  // Longer swoosh — filtered noise sweep
  const bufferSize = Math.ceil(audioCtx.sampleRate * 0.3);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;

  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(800, audioCtx.currentTime);
  bp.frequency.exponentialRampToValueAtTime(3000, audioCtx.currentTime + 0.15);
  bp.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.3);
  bp.Q.value = 1.5;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

  source.connect(bp);
  bp.connect(gain);
  gain.connect(audioCtx.destination);

  source.start(audioCtx.currentTime);
  source.stop(audioCtx.currentTime + 0.3);
}

/** Bid place — subtle card tap */
export function playBidPlace() {
  ensureContext();
  if (!audioCtx) return;

  // Very short crisp tap
  playNoiseBurst(0.04, 3000, 7000, 0.15);
}

/** Trick slide — cards sweeping across table to winner */
export function playTrickSlide() {
  ensureContext();
  if (!audioCtx) return;

  // Longer swoosh with rising pitch sweep
  const bufferSize = Math.ceil(audioCtx.sampleRate * 0.4);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;

  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(400, audioCtx.currentTime);
  bp.frequency.exponentialRampToValueAtTime(2000, audioCtx.currentTime + 0.25);
  bp.frequency.exponentialRampToValueAtTime(500, audioCtx.currentTime + 0.4);
  bp.Q.value = 1.0;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
  gain.gain.setValueAtTime(0.2, audioCtx.currentTime + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

  source.connect(bp);
  bp.connect(gain);
  gain.connect(audioCtx.destination);

  source.start(audioCtx.currentTime);
  source.stop(audioCtx.currentTime + 0.4);
}

/** Card deal / distribute — rapid flutter */
export function playCardDeal() {
  ensureContext();
  if (!audioCtx) return;

  // Quick series of tiny snaps
  for (let i = 0; i < 3; i++) {
    const t = audioCtx.currentTime + i * 0.04;
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
