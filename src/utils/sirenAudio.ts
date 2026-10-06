/**
 * 🚨 Web Audio Distress Siren Generator
 * 
 * Synthesizes a loud, piercing modulation alarm using native browser Web Audio API.
 * Works 100% offline with zero external audio assets.
 */

let audioCtx: AudioContext | null = null;
let sirenOsc: OscillatorNode | null = null;
let sirenGain: GainNode | null = null;
let sirenInterval: ReturnType<typeof setInterval> | null = null;
let isPlaying = false;

export function playEmergencySiren(): boolean {
  if (isPlaying) return true;

  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return false;

    audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    sirenOsc = audioCtx.createOscillator();
    sirenGain = audioCtx.createGain();

    // Piercing sawtooth wave
    sirenOsc.type = 'sawtooth';
    sirenOsc.frequency.setValueAtTime(950, audioCtx.currentTime);

    // High volume level
    sirenGain.gain.setValueAtTime(0.4, audioCtx.currentTime);

    sirenOsc.connect(sirenGain);
    sirenGain.connect(audioCtx.destination);
    sirenOsc.start();

    // Modulating frequency sweep: 950Hz <-> 1850Hz every 380ms
    let isHigh = false;
    sirenInterval = setInterval(() => {
      if (!audioCtx || !sirenOsc) return;
      isHigh = !isHigh;
      const targetFreq = isHigh ? 1850 : 950;
      sirenOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.08);
    }, 380);

    isPlaying = true;
    return true;
  } catch (err) {
    console.warn('[sirenAudio] Web Audio initialization warning:', err);
    return false;
  }
}

export function stopEmergencySiren(): void {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }

  if (sirenOsc) {
    try {
      sirenOsc.stop();
      sirenOsc.disconnect();
    } catch {
      // Ignore cleanup errors
    }
    sirenOsc = null;
  }

  if (sirenGain) {
    try {
      sirenGain.disconnect();
    } catch {
      // Ignore cleanup errors
    }
    sirenGain = null;
  }

  if (audioCtx) {
    try {
      audioCtx.close();
    } catch {
      // Ignore cleanup errors
    }
    audioCtx = null;
  }

  isPlaying = false;
}

export function isEmergencySirenPlaying(): boolean {
  return isPlaying;
}

/**
 * 🔔 Gentle but urgent 2-tone Safety Prompt Beep (880Hz -> 1174Hz)
 */
export function playWarningBeep(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const now = ctx.currentTime;

    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1174, now + 0.18);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.6);

    setTimeout(() => {
      try { ctx.close(); } catch { /* best effort: ignore */ }
    }, 800);
  } catch { /* best effort: ignore */ }
}
