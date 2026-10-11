/* Converts 16-bit mono PCM to MP3 away from the main thread, so the app stays smooth.
   Input message : { samples: Int16Array, sampleRate: number, kbps: number }
   Output messages: { type: 'progress', value: 0..1 } and { type: 'done', parts: ArrayBuffer[] }
                   or { type: 'error', message } */
importScripts('lame.min.js');

self.onmessage = e => {
  try {
    const { samples, sampleRate, kbps } = e.data;
    if (!(samples instanceof Int16Array) || !samples.length) throw new Error('No audio to convert');
    const enc = new lamejs.Mp3Encoder(1, sampleRate, kbps);
    const block = 1152 * 8;
    const parts = [];
    let lastReport = 0;
    for (let i = 0; i < samples.length; i += block) {
      const out = enc.encodeBuffer(samples.subarray(i, Math.min(i + block, samples.length)));
      if (out.length) parts.push(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
      const p = i / samples.length;
      if (p - lastReport >= 0.02) { lastReport = p; self.postMessage({ type: 'progress', value: p }); }
    }
    const tail = enc.flush();
    if (tail.length) parts.push(tail.buffer.slice(tail.byteOffset, tail.byteOffset + tail.byteLength));
    self.postMessage({ type: 'done', parts }, parts);
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
