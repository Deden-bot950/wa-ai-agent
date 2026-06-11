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
      body: JSON.stringify({ status: "ok", message: "WA AI Agent webhook active (Groq)" }),
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

    const sender  = body.sender  || body.from || "";
    const message = body.message || body.text || body.msg || "";

    if (!sender || !message) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: "ignored" }) };
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

    const systemPrompt = `Kamu adalah ${BOT_NAME}, asisten WhatsApp yang cerdas dan ramah.\n\nKNOWLEDGE BASE:\n${KNOWLEDGE_BASE}\n\nJawab singkat dan padat cocok untuk WhatsApp. Gunakan emoji secukupnya. Selalu sebut dirimu ${BOT_NAME}.`;

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
};
