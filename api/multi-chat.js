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

    const results = await Promise.allSettled(
      allModels.map(api => callAPI(api, message, trimmedHistory))
    );

    const replies = {};
    allModels.forEach((api, i) => {
      replies[api] = results[i].status === "fulfilled"
        ? results[i].value
        : `Gagal: ${results[i].reason?.message || "unknown error"}`;
    });

    return res.status(200).json({ replies });

  } catch (err) {
    console.error("MULTI-CHAT ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
