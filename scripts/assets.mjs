import { mkdir, copyFile } from "node:fs/promises";
for (const dir of ["public/core", "public/ort"])
  await mkdir(dir, { recursive: true });
for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"])
  await copyFile(
    "node_modules/@ffmpeg/core/dist/esm/" + name,
    "public/core/" + name,
  );
for (const name of [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
])
  await copyFile(
    "node_modules/onnxruntime-web/dist/" + name,
    "public/ort/" + name,
  );
