// api/chat.js — Vercel Serverless Function untuk single chat
const { callAPI } = require("./_lib");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, api = "groq", history = [] } = req.body;
    if (!message) return res.status(400).json({ reply: "Pesan kosong!" });

    const trimmedHistory = Array.isArray(history) ? history.slice(-6) : [];

    // callAPI sudah punya fallback chain panjang — jika satu model rate limit,
    // otomatis pindah ke model berikutnya tanpa perlu restart dari frontend.
    const reply = await callAPI(api, message, trimmedHistory);
    return res.status(200).json({ reply });

  } catch (err) {
    console.error("CHAT ERROR:", err.message);
    const msg = err.message || "";

    let errMsg;
    if (msg.includes("429") || msg.includes("rate") || msg.includes("quota")) {
      errMsg = "⚠️ Semua model sedang penuh (rate limit). Coba lagi dalam 30 detik.";
    } else if (msg.includes("503") || msg.includes("502")) {
      errMsg = "⚠️ Server model sedang down. Coba lagi sebentar.";
    } else if (msg.includes("AbortError") || msg.includes("Timeout")) {
      errMsg = "⏱️ Model terlalu lama merespons. Coba lagi atau pilih model lain.";
    } else {
      errMsg = "❌ Error: " + msg;
    }

    return res.status(200).json({ reply: errMsg });
  }
};
