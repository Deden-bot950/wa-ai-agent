// netlify/functions/generate-video.js
// Starts a Veo 3.1 video generation job. Returns an operation name to poll.
// Body: { prompt, referenceImage? (base64 data url), aspectRatio? }

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

  const { prompt, referenceImage, aspectRatio } = payload;
  if (!prompt) {
    return { statusCode: 400, body: JSON.stringify({ error: "prompt wajib diisi" }) };
  }

  const instance = { prompt };
  if (referenceImage) {
    const match = referenceImage.match(/^data:(.+);base64,(.+)$/);
    if (match) {
      instance.image = { mimeType: match[1], bytesBase64Encoded: match[2] };
    }
  }

  const body = { instances: [instance] };
  if (aspectRatio) {
    body.parameters = { aspectRatio };
  }

  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || "Gemini video API error");
    }

    return { statusCode: 200, body: JSON.stringify({ operationName: data.name }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Gagal memulai generate video" }) };
  }
};
