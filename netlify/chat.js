// netlify/functions/chat.js
// Unified proxy for OpenAI (ChatGPT) and Google Gemini chat completions.
// Body: { provider: 'openai'|'gemini', model, messages: [{role, content, images?:[base64,...]}], systemPrompt }

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { provider, model, messages, systemPrompt } = payload;

  try {
    if (provider === "openai") {
      return await callOpenAI(model, messages, systemPrompt);
    } else if (provider === "gemini") {
      return await callGemini(model, messages, systemPrompt);
    }
    return { statusCode: 400, body: JSON.stringify({ error: "provider harus 'openai' atau 'gemini'" }) };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Terjadi kesalahan di server" }),
    };
  }
};

async function callOpenAI(model, messages, systemPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY belum diset di environment variables Netlify");

  const oaMessages = [];
  if (systemPrompt) oaMessages.push({ role: "system", content: systemPrompt });

  for (const m of messages) {
    if (m.images && m.images.length > 0) {
      const content = [{ type: "text", text: m.content || "" }];
      for (const img of m.images) {
        content.push({ type: "image_url", image_url: { url: img } });
      }
      oaMessages.push({ role: m.role, content });
    } else {
      oaMessages.push({ role: m.role, content: m.content });
    }
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: oaMessages,
      max_tokens: 4096,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "OpenAI API error");
  }

  const text = data.choices?.[0]?.message?.content || "";
  return { statusCode: 200, body: JSON.stringify({ text }) };
}

async function callGemini(model, messages, systemPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY belum diset di environment variables Netlify");

  const geminiModel = model || "gemini-2.5-flash";

  const contents = messages.map((m) => {
    const parts = [];
    if (m.content) parts.push({ text: m.content });
    if (m.images && m.images.length > 0) {
      for (const img of m.images) {
        const match = img.match(/^data:(.+);base64,(.+)$/);
        if (match) {
          parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
        }
      }
    }
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });

  const body = { contents };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Gemini API error");
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  return { statusCode: 200, body: JSON.stringify({ text }) };
}
