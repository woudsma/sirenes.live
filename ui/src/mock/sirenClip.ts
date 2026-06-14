// Synthesizes a short two-tone siren as an 8-bit/8 kHz mono WAV data URI, so the
// playback button is demonstrable offline (dev server). On a real device, clips
// are MP3s served from /api/clip — both play through a plain <audio>/Audio().

let cached: string | null = null

export function demoSirenClip(): string {
  if (cached) return cached
  const sr = 8000
  const seconds = 2
  const n = sr * seconds
  const buf = new Uint8Array(44 + n)
  const view = new DataView(buf.buffer)

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + n, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sr, true)
  view.setUint32(28, sr, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true) // 8-bit
  writeStr(36, 'data')
  view.setUint32(40, n, true)

  // Alternate 440 Hz / 580 Hz every 0.5 s (a stylized two-tone horn).
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const freq = Math.floor(t * 2) % 2 === 0 ? 440 : 580
    const s = Math.sin(2 * Math.PI * freq * t)
    buf[44 + i] = 128 + Math.round(58 * s)
  }

  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  cached = 'data:audio/wav;base64,' + btoa(bin)
  return cached
}
