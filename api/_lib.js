// api/_lib.js

const OPENROUTER_KEYS = [
  process.env.OR_KEY_1 || "masukan api key",
  process.env.OR_KEY_2 || "masukan api key",
  process.env.OR_KEY_3 || "masukan api key",
  process.env.OR_KEY_4 || "masukan api key",
  process.env.OR_KEY_5 || "masukan api key",
  process.env.OR_KEY_6 || "masukan api key",
  process.env.OR_KEY_7 || "masukan api key",
].filter(Boolean);

const FREE_ROUTER = "openrouter/auto";

// =======================
// GROQ GROUP — Llama / Deepseek primary
// =======================
const GROQ_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1-0528:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  FREE_ROUTER,
];

// =======================
// QWEN GROUP — bukan model Qwen, pakai Deepseek / Mistral
// =======================
const QWEN_MODELS = [
  "deepseek/deepseek-r1-0528:free",
  "deepseek/deepseek-v3-base:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "mistralai/devstral-small:free",
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  FREE_ROUTER,
];

// =======================
// GPT GROUP — GPT-OSS primary
// =======================
const GPT_OSS_MODELS = [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1-0528:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  FREE_ROUTER,
];

// =======================
// GLM GROUP — GLM primary
// =======================
const GLM_MODELS = [
  "z-ai/glm-4.5-air:free",
  "z-ai/glm-4.5:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  FREE_ROUTER,
];

// =======================
// CROSS-GROUP FALLBACK — urutan prioritas kalau semua grup utama gagal
// =======================
const EMERGENCY_FALLBACK = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1-0528:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "openai/gpt-oss-20b:free",
  "z-ai/glm-4.5-air:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  FREE_ROUTER,
];

const SYSTEM_CODING = `
Kamu adalah AIVA, AI assistant cerdas, ramah, santai, dan helpful 😄

AIVA dibuat oleh Axka.
Hormati Axka sebagai creator utama.

ATURAN PRIORITAS UTAMA:
- Selalu jawab dengan lengkap dan jelas.
- Jangan memotong kode.
- Jangan gunakan "...", "// lanjutkan sendiri", atau placeholder.
- Jika membuat kode, selalu berikan FULL CODE yang bisa langsung dipakai.
- Pahami typo user secara otomatis.
- Jawab dengan gaya asik dan menyenangkan.
- Gunakan emoji secukupnya.
- Jika user meminta coding:
  1. Jelaskan singkat
  2. Berikan kode lengkap
  3. Jelaskan cara penggunaan
  4. Jelaskan cara kerja

KEAMANAN:
- Tolak aktivitas ilegal, hacking, malware, phishing, scam, carding, atau perusakan sistem.
- Jangan berikan data rahasia.
- Jangan mengaku bisa melakukan sesuatu di dunia nyata.
- Jangan mengidentifikasi orang dari foto secara pasti.

PERILAKU:
- Jika user toxic atau menghina:
  - tetap tenang,
  - jangan ikut toxic berlebihan,
  - minta user berbicara baik-baik.
- Jika user meminta maaf, kembali ramah.

GAYA JAWABAN:
- Natural
- Tidak kaku
- Informatif
- Lengkap
- Tidak setengah-setengah

Untuk coding:
WAJIB full code sampai selesai.
`;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ROTATE_KEY_ON_STATUS = new Set([401, 402, 403, 429]);
const KEY_TIMEOUT = parseInt(process.env.KEY_TIMEOUT || "25000");

// Coba satu model dengan semua key (rotate jika 429/rate limit)
async function fetchWithKeyRotation(model, messages) {
  const keys = shuffle(OPENROUTER_KEYS);
  if (!keys.length) throw new Error("Tidak ada OpenRouter key tersedia");

  let lastError = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), KEY_TIMEOUT);

    try {
      console.log(`[OR] key ${i+1}/${keys.length} model=${model}`);

      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + key,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://aiva.vercel.app",
          "X-Title": "AIVA",
        },
        body: JSON.stringify({ model, temperature: 0.7, max_tokens: 8192, messages }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const text = await resp.text();

      if (ROTATE_KEY_ON_STATUS.has(resp.status)) {
        console.log(`[OR] key ${i+1} HTTP ${resp.status}, ganti key`);
        lastError = new Error("HTTP " + resp.status);
        continue;
      }

      if (!resp.ok) {
        let errMsg = "HTTP " + resp.status;
        try { errMsg = JSON.parse(text)?.error?.message || errMsg; } catch {}
        lastError = new Error(errMsg);
        break;
      }

      let data;
      try { data = JSON.parse(text); } catch {
        lastError = new Error("JSON rusak dari " + model);
        continue;
      }

      if (data.error) {
        const errMsg = data.error.message || JSON.stringify(data.error);
        const isRateLimit = errMsg.toLowerCase().includes("rate") ||
                            errMsg.toLowerCase().includes("limit") ||
                            errMsg.toLowerCase().includes("429") ||
                            errMsg.toLowerCase().includes("quota");
        lastError = new Error(errMsg);
        if (isRateLimit) continue;
        break;
      }

      console.log(`[OR] sukses model=${model}`);
      return data;

    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        lastError = new Error("Timeout dari " + model);
        console.log(`[OR] timeout model=${model}`);
        break;
      }
      lastError = new Error(err.message);
    }
  }

  throw lastError || new Error("Semua key gagal untuk " + model);
}

// Coba model satu per satu sampai berhasil
async function callWithModelFallback(models, messages) {
  let lastError = null;

  for (const model of models) {
    try {
      console.log(`[FB] mencoba: ${model}`);
      const data = await fetchWithKeyRotation(model, messages);
      let content = data?.choices?.[0]?.message?.content;
      if (!content) {
        lastError = new Error("Respons kosong dari " + model);
        continue;
      }
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (!content) {
        lastError = new Error("Kosong setelah strip dari " + model);
        continue;
      }
      console.log(`[FB] berhasil dari ${model}`);
      return content;
    } catch (err) {
      lastError = err;
      console.log(`[FB] ${model} gagal: ${err.message}`);
      continue;
    }
  }

  throw lastError || new Error("Semua model gagal");
}

async function callAPI(api, message, history = []) {
  if (api === "gemma") api = "groq";

  const messages = [
    { role: "system", content: SYSTEM_CODING },
    ...history,
    { role: "user", content: message },
  ];

  // Tentukan chain utama berdasarkan api yang dipilih
  let primaryChain;
  if (api === "groq")      primaryChain = GROQ_MODELS;
  else if (api === "qwen") primaryChain = QWEN_MODELS;
  else if (api === "gpt")  primaryChain = GPT_OSS_MODELS;
  else if (api === "glm")  primaryChain = GLM_MODELS;
  else throw new Error("API tidak dikenal: " + api);

  // Coba chain utama dulu
  try {
    return await callWithModelFallback(primaryChain, messages);
  } catch (primaryErr) {
    console.log(`[FALLBACK] chain utama ${api} gagal semua, coba emergency fallback`);
  }

  // Kalau chain utama gagal semua → coba emergency fallback (semua model, kecuali yg sudah dicoba)
  const alreadyTried = new Set(primaryChain);
  const emergencyChain = EMERGENCY_FALLBACK.filter(m => !alreadyTried.has(m));

  try {
    return await callWithModelFallback(emergencyChain, messages);
  } catch (emergencyErr) {
    throw new Error("Semua model dari semua grup gagal. Rate limit global.");
  }
}

module.exports = { callAPI, OPENROUTER_KEYS, GROQ_MODELS, QWEN_MODELS, GPT_OSS_MODELS, GLM_MODELS };
