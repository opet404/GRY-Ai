// api/multi-chat.js — Vercel Serverless Function untuk multi-model chat
const { callAPI } = require("./_lib");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, models: selectedModels, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: "Pesan kosong!" });

    const allModels = selectedModels && selectedModels.length >= 2
      ? selectedModels
      : ["groq", "qwen", "gpt"];

    // History dari frontend (dikelola di localStorage per sesi)
    const trimmedHistory = Array.isArray(history) ? history.slice(-12) : [];

    // Jalankan semua model paralel — masing-masing punya fallback chain sendiri
    // Jika model X rate limit, dia otomatis fallback ke model X+1 di _lib.js
    const results = await Promise.allSettled(
      allModels.map(api => callAPI(api, message, trimmedHistory))
    );

    const replies = {};
    allModels.forEach((api, i) => {
      if (results[i].status === "fulfilled") {
        replies[api] = results[i].value;
      } else {
        const errMsg = results[i].reason?.message || "unknown error";
        console.error(`[MULTI] ${api} gagal:`, errMsg);
        replies[api] = `Gagal: ${errMsg}`;
      }
    });

    return res.status(200).json({ replies });

  } catch (err) {
    console.error("MULTI-CHAT ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
