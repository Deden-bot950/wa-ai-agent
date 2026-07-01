// netlify/functions/video-status.js
// Poll a Veo operation. When done, fetches the finished video and returns it as base64.
// Query: ?op=<operationName>

exports.handler = async function (event) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY belum diset" }) };
  }

  const opName = event.queryStringParameters?.op;
  if (!opName) {
    return { statusCode: 400, body: JSON.stringify({ error: "parameter 'op' wajib diisi" }) };
  }

  try {
    const statusRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${opName}`, {
      headers: { "x-goog-api-key": apiKey },
    });
    const statusData = await statusRes.json();

    if (!statusRes.ok) {
      throw new Error(statusData.error?.message || "Gagal cek status video");
    }

    if (!statusData.done) {
      return { statusCode: 200, body: JSON.stringify({ done: false }) };
    }

    if (statusData.error) {
      throw new Error(statusData.error.message || "Video generation gagal");
    }

    const sample = statusData.response?.generateVideoResponse?.generatedSamples?.[0];
    const videoUri = sample?.video?.uri;
    if (!videoUri) {
      throw new Error("Video selesai tapi URI tidak ditemukan, coba lagi");
    }

    const videoRes = await fetch(videoUri, {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!videoRes.ok) {
      throw new Error("Gagal download hasil video dari Google");
    }
    const arrayBuffer = await videoRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return {
      statusCode: 200,
      body: JSON.stringify({ done: true, video: `data:video/mp4;base64,${base64}` }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Terjadi kesalahan" }) };
  }
};
