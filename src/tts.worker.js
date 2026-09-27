import * as ort from "onnxruntime-web";
import { loadTextToSpeech, loadVoiceStyle, writeWavFile } from "./supertonic";
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = "/ort/";
const base =
  "https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/aafc6e32416a594460b32413efc49d7fe4ce6d46";
let tts;
const styles = {};
self.onmessage = async ({ data }) => {
  try {
    tts ??= await loadTextToSpeech(
      base + "/onnx",
      { executionProviders: ["wasm"] },
      (name, i, n) =>
        postMessage({ progress: `한국어 음성 모델 ${i}/${n} 불러오는 중…` }),
    );
    styles[data.voice] ??= await loadVoiceStyle([
      `${base}/voice_styles/${data.voice}.json`,
    ]);
    postMessage({ progress: "한국어 내레이션을 만들고 있어요…" });
    const result = await tts.textToSpeech.call(
      data.text,
      "ko",
      styles[data.voice],
      5,
      data.speed,
      0.2,
      (a, b) => postMessage({ progress: `한국어 음성 합성 ${a}/${b}` }),
    );
    const wav = writeWavFile(result.wav, tts.textToSpeech.sampleRate);
    postMessage({ result: wav }, [wav]);
  } catch (e) {
    postMessage({ error: e.message });
  }
};
