// Simple synth for UI sounds using Web Audio API
let audioCtx: AudioContext | null = null;

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

const createOscillator = (ctx: AudioContext, type: OscillatorType, freq: number, duration: number, vol: number = 0.1) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start();
  osc.stop(ctx.currentTime + duration);
};

export const playSound = (type: 'click' | 'tick' | 'bull' | 'bear' | 'hover' | 'success' | 'error') => {
  const ctx = initAudio();
  if (!ctx) return;

  switch (type) {
    case 'click':
      // High tech blip
      createOscillator(ctx, 'sine', 800, 0.1, 0.1);
      createOscillator(ctx, 'square', 1200, 0.05, 0.05);
      break;
    case 'hover':
      // Subtle air sound
      createOscillator(ctx, 'sine', 400, 0.05, 0.02);
      break;
    case 'tick':
      // Mechanical tick
      createOscillator(ctx, 'triangle', 2000, 0.03, 0.05);
      break;
    case 'bull':
      // Major Chord Arpeggio (Victory)
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        setTimeout(() => createOscillator(ctx!, 'sine', freq, 0.4, 0.1), i * 50);
      });
      break;
    case 'bear':
      // Low Warning Sound
      createOscillator(ctx, 'sawtooth', 150, 0.4, 0.1);
      createOscillator(ctx, 'sawtooth', 145, 0.4, 0.1); // Dissonance
      break;
    case 'success':
      // High pitched distinct success ding
      createOscillator(ctx, 'sine', 880, 0.1, 0.1);
      setTimeout(() => createOscillator(ctx!, 'sine', 1760, 0.2, 0.1), 50);
      break;
    case 'error':
      // Low buzz
      createOscillator(ctx, 'sawtooth', 110, 0.3, 0.2);
      createOscillator(ctx, 'square', 55, 0.3, 0.2);
      break;
  }
};
