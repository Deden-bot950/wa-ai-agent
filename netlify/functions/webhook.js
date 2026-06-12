exports.handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod === "GET") return { statusCode: 200, headers, body: JSON.stringify({ status: "ok" }) };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    let body;
    try { body = JSON.parse(event.body); }
    catch { const p = new URLSearchParams(event.body); body = Object.fromEntries(p.entries()); }

    const sender  = body.sender || body.from || "";
    const message = body.message || body.text || body.msg || "";
    if (!sender || !message) return { statusCode: 200, headers, body: JSON.stringify({ status: "ignored" }) };

    const FONNTE_TOKEN  = process.env.FONNTE_TOKEN;
    const GROQ_API_KEY  = process.env.GROQ_API_KEY;
    const OWNER_NUMBER  = process.env.OWNER_NUMBER || "";
    const UPSTASH_URL   = process.env.UPSTASH_REDIS_URL;
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_TOKEN;

    if (!FONNTE_TOKEN || !GROQ_API_KEY) return { statusCode: 200, headers, body: JSON.stringify({ status: "error" }) };

    const cleanSender = sender.replace(/[^0-9]/g, "");
    const cleanOwner  = OWNER_NUMBER.replace(/[^0-9]/g, "");
    if (cleanOwner && cleanSender === cleanOwner) return { statusCode: 200, headers, body: JSON.stringify({ status: "ignored" }) };

    let history = [];
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      try {
        const r = await fetch(`${UPSTASH_URL}/get/chat:${cleanSender}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
        const d = await r.json();
        if (d.result) history = JSON.parse(d.result);
      } catch(e) { history = []; }
    }

    history.push({ role: "user", content: message });
    if (history.length > 10) history = history.slice(history.length - 10);

    const isFirstMessage = history.length <= 1;

    const systemPrompt = "Kamu adalah Rifty Agustin, Customer Service dari Sarana Multy Logam. Kamu adalah manusia, bukan AI atau bot.\n\n" +
      "IDENTITAS:\n" +
      "- Nama: Rifty Agustin\n" +
      "- Posisi: Customer Service Sarana Multy Logam\n" +
      "- Sifat: Ramah, hangat, sabar, profesional\n\n" +
      "PERUSAHAAN:\n" +
      "- Nama: Sarana Multy Logam\n" +
      "- Alamat: Jl. Cibuntu Tengah 1 RT 04/09, Bandung, Jawa Barat\n" +
      "- Bidang: Fabrikasi mesin industri dan UMKM\n" +
      "- WA: 625371526068\n\n" +
      "PRODUK:\n" +
      "- Kuali/Wajan Besar (besi & stainless) berbagai ukuran\n" +
      "- Mesin Mixer/Pengaduk Adonan\n" +
      "- Mesin Penggiling/Pengolah Bahan Makanan\n" +
      "- Tangki/Bak Stainless berbagai ukuran\n" +