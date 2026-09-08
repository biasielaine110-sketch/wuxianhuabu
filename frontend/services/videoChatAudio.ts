import { fetchVideoBlobForBrowser, rewriteImageUrlForBrowserDisplay } from './canvasAssetResolver';

export type ChatVideoAudio = {
  /** 无 data: 前缀的 base64 */
  data: string;
  mime: string;
  durationSec: number;
};

const MAX_CHAT_AUDIO_SEC = 60;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(new Error('音频读取失败'));
    reader.readAsDataURL(blob);
  });
}

function encodeWavMono16k(buffer: AudioBuffer): Blob {
  const sampleRate = 16000;
  const duration = Math.min(buffer.duration, MAX_CHAT_AUDIO_SEC);
  const length = Math.max(1, Math.floor(duration * sampleRate));
  const pcm = new Int16Array(length);
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const srcRate = buffer.sampleRate || sampleRate;
  for (let i = 0; i < length; i++) {
    const srcIdx = (i * srcRate) / sampleRate;
    const i0 = Math.min(ch0.length - 1, Math.max(0, Math.floor(srcIdx)));
    let s = ch0[i0] || 0;
    if (ch1) s = (s + (ch1[Math.min(ch1.length - 1, i0)] || 0)) / 2;
    const c = Math.max(-1, Math.min(1, s));
    pcm[i] = c < 0 ? c * 0x8000 : c * 0x7fff;
  }
  const bytes = pcm.byteLength;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, bytes, true);
  return new Blob([header, pcm], { type: 'audio/wav' });
}

function pickAudioRecorderMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || '';
}

function waitEvent(el: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, timeoutMs);
    const ok = () => {
      window.clearTimeout(timer);
      cleanup();
      resolve();
    };
    const bad = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new Error('video error'));
    };
    const cleanup = () => {
      el.removeEventListener(event, ok);
      el.removeEventListener('error', bad);
    };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener('error', bad, { once: true });
  });
}

async function recordedBlobToWav(blob: Blob): Promise<ChatVideoAudio | null> {
  if (blob.size < 64) return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const wav = encodeWavMono16k(decoded);
    if (wav.size < 128) return null;
    return {
      data: await blobToBase64(wav),
      mime: 'audio/wav',
      durationSec: Math.min(decoded.duration, MAX_CHAT_AUDIO_SEC),
    };
  } catch {
    const mime = blob.type && blob.type.startsWith('audio/') ? blob.type : 'audio/webm';
    return {
      data: await blobToBase64(blob),
      mime,
      durationSec: MAX_CHAT_AUDIO_SEC,
    };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

async function recordAudioFromPlayableSrc(playSrc: string, useCors: boolean): Promise<Blob | null> {
  if (typeof MediaRecorder === 'undefined') return null;
  const v = document.createElement('video');
  if (useCors) v.crossOrigin = 'anonymous';
  v.playsInline = true;
  v.preload = 'auto';
  v.muted = true;
  v.defaultMuted = true;
  v.volume = 1;
  v.setAttribute('playsinline', 'true');
  v.style.cssText = 'position:fixed;left:-9999px;top:0;width:32px;height:32px;opacity:0;pointer-events:none;';
  document.body.appendChild(v);

  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  let ctx: AudioContext | null = null;
  try {
    v.src = playSrc;
    v.load();
    await waitEvent(v, 'loadedmetadata', 14000);
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    const clipSec = Math.min(MAX_CHAT_AUDIO_SEC, dur > 0 ? dur : MAX_CHAT_AUDIO_SEC);
    ctx = new Ctx();
    await ctx.resume().catch(() => undefined);
    const srcNode = ctx.createMediaElementSource(v);
    const dest = ctx.createMediaStreamDestination();
    srcNode.connect(dest);

    const recMime = pickAudioRecorderMime();
    const rec = recMime ? new MediaRecorder(dest.stream, { mimeType: recMime }) : new MediaRecorder(dest.stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    rec.start(200);
    try {
      v.currentTime = 0;
    } catch {
      /* ignore */
    }
    await v.play();
    v.muted = false;
    v.defaultMuted = false;
    v.volume = 1;
    await new Promise((r) => window.setTimeout(r, Math.max(400, clipSec * 1000)));
    try {
      v.pause();
    } catch {
      /* ignore */
    }
    if (rec.state !== 'inactive') rec.stop();
    await Promise.race([stopped, new Promise((r) => window.setTimeout(r, 2000))]);
    if (!chunks.length) return null;
    return new Blob(chunks, { type: rec.mimeType || recMime || 'audio/webm' });
  } finally {
    try {
      v.pause();
      v.removeAttribute('src');
      v.load();
    } catch {
      /* ignore */
    }
    v.remove();
    await ctx?.close().catch(() => undefined);
  }
}

/** 从视频抽出音轨（优先 16kHz 单声道 WAV），供对话模型识别台词/音效；无声或失败返回 null */
export async function videoUrlToChatAudio(url: string): Promise<ChatVideoAudio | null> {
  const t = (url || '').trim();
  if (!t) return null;
  let playSrc = t;
  let revoke: (() => void) | undefined;
  try {
    if (!t.startsWith('blob:') && !t.startsWith('data:')) {
      const blob = await fetchVideoBlobForBrowser(t);
      playSrc = URL.createObjectURL(blob);
      revoke = () => URL.revokeObjectURL(playSrc);
    }
    let recorded = await recordAudioFromPlayableSrc(playSrc, false);
    if (!recorded && !t.startsWith('blob:') && !t.startsWith('data:')) {
      recorded = await recordAudioFromPlayableSrc(rewriteImageUrlForBrowserDisplay(t), true);
    }
    if (!recorded) return null;
    return recordedBlobToWav(recorded);
  } catch {
    return null;
  } finally {
    revoke?.();
  }
}
