// api/_lib.js

const GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  "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";

const OPENROUTER_KEYS = [
  process.env.OR_KEY_1 || "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",
  process.env.OR_KEY_2 || "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",
  process.env.OR_KEY_3 || "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",
  process.env.OR_KEY_4 || "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",
  process.env.OR_KEY_5 || "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",
  process.env.OR_KEY_6 || "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",
  process.env.OR_KEY_7 || "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",
].filter(Boolean);

// ============================================================
// STRATEGI MODEL — per Mei 2026
//
// "openrouter/free" = auto-router resmi OpenRouter.
// Dia pilih sendiri model free yang available saat itu.
// Tidak akan kena 429 satu model terus karena dia spread otomatis.
// Ini jadi model UTAMA untuk semua API.
//
// Fallback = model spesifik yang terbukti stabil.
// ============================================================

const FREE_ROUTER = "openrouter/free"; // auto-pilih model free terbaik yang available

// AIVA/Qwen — coding & general
const QWEN_MODELS = [
  FREE_ROUTER,                                    // 1. auto-router (tidak expire, tidak 429)
  "meta-llama/llama-3.3-70b-instruct:free",      // 2. fallback stabil
  "qwen/qwen3-coder:free",                        // 3. terbaik untuk coding
  "nvidia/nemotron-3-super-120b-a12b:free",       // 4. powerful
  "google/gemma-4-31b-it:free",                   // 5. reliable
  "meta-llama/llama-3.2-3b-instruct:free",        // 6. ringan, last resort
];

// GPT-OSS
const GPT_OSS_MODELS = [
  "openai/gpt-oss-20b:free",                     // coba model asli dulu
  "openai/gpt-oss-120b:free",
  FREE_ROUTER,                                    // fallback ke auto-router
  "meta-llama/llama-3.3-70b-instruct:free",
];

// GLM — Z.AI
const GLM_MODELS = [
  "z-ai/glm-4.5-air:free",                       // GLM resmi
  FREE_ROUTER,                                    // fallback ke auto-router kalau GLM 429
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
];

const SYSTEM_CODING = `Kamu adalah GRY AI, asisten AI yang cerdas dan helpful.

ATURAN WAJIB — TIDAK BOLEH DILANGGAR:
- SELALU selesaikan jawaban sampai tuntas. JANGAN berhenti di tengah kalimat atau kode.
- JANGAN tulis "// lanjutkan sendiri", "// ... dst", "// tambahkan sendiri", atau kalimat serupa.
- JANGAN potong kode dengan "..." atau komentar pengganti kode.
- Jika jawabannya panjang, tetap tulis semuanya sampai selesai.

Jika user meminta kode/coding/program, WAJIB berikan:
1. Penjelasan singkat apa yang akan dibuat
2. Kode LENGKAP, PENUH, dan BISA LANGSUNG DIJALANKAN — tidak ada bagian yang dihilangkan
3. Penjelasan cara kerja dan cara penggunaan
4. Contoh output jika relevan

Untuk pertanyaan non-coding: jawab lengkap dan jelas sampai tuntas.`;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ROTATE_KEY_ON_STATUS = new Set([401, 402, 403, 429]);

// Timeout cukup lama — biarkan model reasoning selesai berpikir
// Vercel Hobby cut di 10 detik, kita tidak paksa cut lebih awal
const KEY_TIMEOUT = parseInt(process.env.KEY_TIMEOUT || "25000");

// Coba satu model dengan semua key (rotate jika 429)
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

      // 429 / 401 / 403 → ganti key, coba lagi
      if (ROTATE_KEY_ON_STATUS.has(resp.status)) {
        console.log(`[OR] key ${i+1} HTTP ${resp.status}, ganti key`);
        lastError = new Error("HTTP " + resp.status);
        continue;
      }

      if (!resp.ok) {
        let errMsg = "HTTP " + resp.status;
        try { errMsg = JSON.parse(text)?.error?.message || errMsg; } catch {}
        lastError = new Error(errMsg);
        break; // error lain (404, 500) → keluar, coba model berikut
      }

      let data;
      try { data = JSON.parse(text); } catch {
        lastError = new Error("JSON rusak dari " + model);
        continue;
      }

      if (data.error) {
        lastError = new Error(data.error.message || JSON.stringify(data.error));
        continue;
      }

      console.log(`[OR] sukses model=${model}`);
      return data;

    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        lastError = new Error("Timeout dari " + model);
        console.log(`[OR] timeout model=${model}`);
        break; // timeout → langsung coba model berikut
      }
      lastError = new Error(err.message);
    }
  }

  throw lastError || new Error("Semua key gagal untuk " + model);
}

// Coba model satu per satu sampai ada yang berhasil
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
      // Strip <think>...</think> dari reasoning model
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
  if (api === "gemma") api = "qwen";

  const messages = [
    { role: "system", content: SYSTEM_CODING },
    ...history,
    { role: "user", content: message },
  ];

  if (api === "groq") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), KEY_TIMEOUT);
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + GROQ_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.7,
          max_tokens: 8192,
          messages,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) throw new Error("Groq HTTP " + resp.status + ": " + await resp.text());
      const d = await resp.json();
      return d.choices?.[0]?.message?.content || "Respons kosong dari Groq";
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  if (api === "qwen") return callWithModelFallback(QWEN_MODELS, messages);
  if (api === "gpt")  return callWithModelFallback(GPT_OSS_MODELS, messages);
  if (api === "glm")  return callWithModelFallback(GLM_MODELS, messages);

  throw new Error("API tidak dikenal: " + api);
}

module.exports = { callAPI, GROQ_API_KEY, OPENROUTER_KEYS, QWEN_MODELS, GPT_OSS_MODELS, GLM_MODELS };
