export const soundLengths = { pop: 0.16, tap: 0.14, swish: 0.22 };
export function effectWave(events, duration) {
  const sr = 48000,
    data = new Float32Array(Math.ceil((duration + 0.25) * sr));
  let seed = 19;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return (seed / 4294967296) * 2 - 1;
  };
  for (const e of events) {
    const len = soundLengths[e.kind];
    if (
      !Number.isFinite(e.at) ||
      !Number.isFinite(e.gain) ||
      !len ||
      e.at < 0 ||
      e.at + len > duration ||
      e.gain < 0 ||
      e.gain > 1
    )
      throw Error("효과음의 시간·종류·음량을 확인하세요.");
    const start = Math.round(e.at * sr),
      n = Math.round(len * sr),
      raw = new Float32Array(n);
    let max = 0,
      smoothed = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr,
        env = Math.sin((Math.PI * t) / len) ** 2 * Math.exp(-t * 12);
      smoothed = smoothed * 0.8 + random() * 0.2;
      raw[i] =
        (e.kind === "swish"
          ? smoothed
          : Math.sin(
              2 * Math.PI * ((e.kind === "pop" ? 950 : 520) * t - 1100 * t * t),
            )) * env;
      max = Math.max(max, Math.abs(raw[i]));
    }
    for (let i = 0; i < n; i++)
      data[start + i] += (raw[i] / (max || 1)) * 0.35 * e.gain;
  }
  const buf = new ArrayBuffer(44 + data.length * 2),
    v = new DataView(buf),
    str = (p, s) =>
      [...s].forEach((c, i) => v.setUint8(p + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + data.length * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++)
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
  return new Uint8Array(buf);
}
export function arrangeEffects(p, count) {
  if (!Number.isInteger(count) || count < 0 || count > 30)
    throw Error("효과음은 0~30개로 선택하세요.");
  if (!count) return [];
  const duration = p.cuts
      .filter((x) => x.keep)
      .reduce((s, c) => s + c.end - c.start, 0),
    blocked = p.cues.map((c) => [c.start, c.end]);
  if (p.narration) {
    if (!p.narrationDuration)
      throw Error("내레이션 길이를 확인한 뒤 다시 시도하세요.");
    blocked.push([p.narrationStart, p.narrationStart + p.narrationDuration]);
  }
  let times = [];
  for (let t = 0.1; t < duration - 0.3; t += 0.1)
    if (!blocked.some(([a, b]) => t < b + 0.08 && t + 0.22 > a - 0.08))
      times.push(Math.round(t * 10) / 10);
  let chosen = [];
  while (times.length && chosen.length < count) {
    times.sort(
      (a, b) =>
        Math.min(
          ...(chosen.length
            ? chosen.map((x) => Math.abs(b - x))
            : [b, duration - b]),
        ) -
        Math.min(
          ...(chosen.length
            ? chosen.map((x) => Math.abs(a - x))
            : [a, duration - a]),
        ),
    );
    const t = times[0];
    chosen.push(t);
    times = times.filter((x) => Math.abs(x - t) >= 1.5);
  }
  if (chosen.length < count)
    throw Error(
      `대사를 피해서 넣을 수 있는 효과음은 ${chosen.length}개입니다. 개수를 줄여 주세요.`,
    );
  return chosen
    .sort((a, b) => a - b)
    .map((at, i) => ({ at, kind: ["pop", "tap", "swish"][i % 3], gain: 1 }));
}
