// netlify/functions/generate-image.js
// Generates an image using Gemini's image generation model (Nano Banana / Gemini Flash Image).
// Body: { prompt, referenceImage? (base64 data url, for edit/remix) }

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY belum diset" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { prompt, referenceImage } = payload;
  if (!prompt) {
    return { statusCode: 400, body: JSON.stringify({ error: "prompt wajib diisi" }) };
  }

  const parts = [{ text: prompt }];
  if (referenceImage) {
    const match = referenceImage.match(/^data:(.+);base64,(.+)$/);
    if (match) {
      parts.unshift({ inline_data: { mime_type: match[1], data: match[2] } });
    }
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || "Gemini image API error");
    }

    const imgPart = data.candidates?.[0]?.content?.parts?.find((p) => p.inline_data || p.inlineData);
    const inline = imgPart?.inline_data || imgPart?.inlineData;
    if (!inline) {
      const textPart = data.candidates?.[0]?.content?.parts?.find((p) => p.text);
      throw new Error(textPart?.text || "Gagal generate gambar, coba prompt lain");
    }

    const dataUrl = `data:${inline.mime_type || inline.mimeType};base64,${inline.data}`;
    return { statusCode: 200, body: JSON.stringify({ image: dataUrl }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Gagal generate gambar" }) };
  }
};
