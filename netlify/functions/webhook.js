exports.handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "ok", message: "WA AI Agent with Memory (Groq)" }),
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      const params = new URLSearchParams(event.body);
      body = Object.fromEntries(params.entries());
    }

    const sender  = body.sender || body.from || "";
    const message = body.message || body.text || body.msg || "";

    if (!sender || !message) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: "ignored" }) };
    }

    const FONNTE_TOKEN    = process.env.FONNTE_TOKEN;
    const GROQ_API_KEY    = process.env.GROQ_API_KEY;
    const const KNOWLEDGE_BASE = process.env.KNOWLEDGE_BASE || `Sarana Multy Logam adalah perusahaan fabrikasi mesin industri dan UMKM di Jl. Cibuntu Tengah 1 RT 04/09, Bandung. Produk: Kuali/Wajan Besar, Mesin Mixer, Mesin Penggiling, Tangki Stainless, Mesin Coating, Peralatan Dapur Industri, Custom mesin. Bahan: plat besi atau stainless steel. WA: 625371526068.`;
    const BOT_NAME        = process.env.BOT_NAME || "Rifty Agustin";
    const OWNER_NUMBER    = process.env.OWNER_NUMBER || "";
    const GROQ_MODEL      = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
    const UPSTASH_URL     = process.env.UPSTASH_REDIS_URL;
    const UPSTASH_TOKEN   = process.env.UPSTASH_REDIS_TOKEN;

    if (!FONNTE_TOKEN || !GROQ_API_KEY) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: "error", reason: "missing config" }) };
    }

    const cleanSender = sender.replace(/[^0-9]/g, "");
    const cleanOwner  = OWNER_NUMBER.replace(/[^0-9]/g, "");
    if (cleanOwner && cleanSender === cleanOwner) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: "ignored" }) };
    }

    // ── Load history dari Upstash ─────────────────────────────────────────
    let history = [];
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      try {
        const getRes = await fetch(`${UPSTASH_URL}/get/chat:${cleanSender}`, {
          headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        });
        const getData = await getRes.json();
        if (getData.result) {
          history = JSON.parse(getData.result);
        }
      } catch (e) {
        history = [];
      }
    }

    // Tambah pesan baru ke history
    history.push({ role: "user", content: message });

    // Batasi history maksimal 10 pesan terakhir
    if (history.length > 10) {
      history = history.slice(history.length - 10);
    }

    // ── Call Groq AI ──────────────────────────────────────────────────────
    const systemPrompt = const systemPrompt = `Namamu adalah ${BOT_NAME}. Kamu adalah Customer Service dari Sarana Multy Logam. Jangan pernah menyebut dirimu sebagai "Sarana Multy Logam" - kamu adalah ${BOT_NAME} orangnya, bukan nama perusahaan.

TENTANG PERUSAHAAN:
Sarana Multy Logam adalah perusahaan fabrikasi mesin industri dan UMKM di Jl. Cibuntu Tengah 1 RT 04/09, Bandung.

KNOWLEDGE BASE:
${KNOWLEDGE_BASE}

CARA BERKOMUNIKASI:
- Selalu kenalkan diri sebagai ${BOT_NAME}, CS dari Sarana Multy Logam
- Jangan pernah sebut dirimu sebagai nama perusahaan
- Sapa pelanggan hangat dan personal
- Gunakan emoji secukupnya
- Jawab singkat dan padat`;
- Kamu sangat pintar bisa menjawab apapun tidak hanya seputar barang yang dijual konsumen curhatpun bisa dilayani
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
        ],
      }),
    });

    const groqData = await groqRes.json();
    const aiReply = groqData.choices?.[0]?.message?.content || JSON.stringify(groqData);

    // Tambah balasan AI ke history
    history.push({ role: "assistant", content: aiReply });

    // ── Simpan history ke Upstash ─────────────────────────────────────────
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      try {
        await fetch(`${UPSTASH_URL}/set/chat:${cleanSender}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${UPSTASH_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ value: JSON.stringify(history) }),
        });
      } catch (e) {}
    }

    // ── Kirim balasan via Fonnte ──────────────────────────────────────────
    await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        "Authorization": FONNTE_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target: sender,
        message: aiReply,
        countryCode: "62",
      }),
    });

    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok" }) };

  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify({ status: "error", message: err.message }) };
  }
};      return { statusCode: 200, headers, body: JSON.stringify({ status: "ignored" }) };
    }

    const FONNTE_TOKEN   = process.env.FONNTE_TOKEN;
    const GROQ_API_KEY   = process.env.GROQ_API_KEY;
    const KNOWLEDGE_BASE = process.env.KNOWLEDGE_BASE || "Saya adalah asisten AI.";
    const BOT_NAME       = process.env.BOT_NAME || "Asisten AI";
    const OWNER_NUMBER   = process.env.OWNER_NUMBER || "";
    const GROQ_MODEL     = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

    if (!FONNTE_TOKEN || !GROQ_API_KEY) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: "error", reason: "missing config" }) };
    }

    const cleanSender = sender.replace(/[^0-9]/g, "");
    const cleanOwner  = OWNER_NUMBER.replace(/[^0-9]/g, "");
    if (cleanOwner && cleanSender === cleanOwner) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: "ignored" }) };
    }

    const systemPrompt = const systemPrompt = `Namamu adalah ${BOT_NAME}. Kamu adalah Customer Service dari Sarana Multy Logam. Jangan pernah menyebut dirimu sebagai "Sarana Multy Logam" - kamu adalah ${BOT_NAME} orangnya, bukan nama perusahaan.

TENTANG PERUSAHAAN:
Sarana Multy Logam adalah perusahaan fabrikasi mesin industri dan UMKM di Jl. Cibuntu Tengah 1 RT 04/09, Bandung.

KNOWLEDGE BASE:
${KNOWLEDGE_BASE}

CARA BERKOMUNIKASI:
- Kamu Asisten sangat pintar bisa jawab apapun 
- Selalu kenalkan diri sebagai ${BOT_NAME}, CS dari Sarana Multy Logam
- Jangan pernah sebut dirimu sebagai nama perusahaan
- Sapa pelanggan hangat dan personal
- Gunakan emoji secukupnya
- Jawab singkat dan padat`;  

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: message },
        ],
      }),
    });

    const groqData = await groqRes.json();
    const aiReply = groqData.choices?.[0]?.message?.content || JSON.stringify(groqData);

    await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        "Authorization": FONNTE_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target: sender,
        message: aiReply,
        countryCode: "62",
      }),
    });

    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok" }) };

  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify({ status: "error", message: err.message }) };
  }
}

