exports.handler = async (event, context) => {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: headers, body: "" };
  if (event.httpMethod === "GET")     return { statusCode: 200, headers: headers, body: JSON.stringify({ status: "ok" }) };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    var body;
    try { body = JSON.parse(event.body); }
    catch(e) { var p = new URLSearchParams(event.body); body = {}; p.forEach(function(v,k){ body[k]=v; }); }

    var sender  = body.sender || body.from || "";
    var message = body.message || body.text || body.msg || "";

    if (!sender || !message) return { statusCode: 200, headers: headers, body: JSON.stringify({ status: "ignored" }) };

    var FONNTE_TOKEN  = process.env.FONNTE_TOKEN;
    var GROQ_API_KEY  = process.env.GROQ_API_KEY;
    var OWNER_NUMBER  = process.env.OWNER_NUMBER || "";
    var UPSTASH_URL   = process.env.UPSTASH_REDIS_URL;
    var UPSTASH_TOKEN = process.env.UPSTASH_REDIS_TOKEN;

    if (!FONNTE_TOKEN || !GROQ_API_KEY) return { statusCode: 200, headers: headers, body: JSON.stringify({ status: "error: missing env" }) };

    var cleanSender = sender.replace(/[^0-9]/g, "");

    // Abaikan jika pengirim adalah nomor Rifty sendiri
    var RIFTY_NUMBER = "6285371526068";
    if (cleanSender === RIFTY_NUMBER) {
      return { statusCode: 200, headers: headers, body: JSON.stringify({ status: "ignored: self" }) };
    }

    // Parse session ID dari pesan jika ada format [SESSION_ID] pesan
    var sessionId = null;
    var actualMessage = message;
    var sessionMatch = message.match(/^\[([A-Z0-9\-]+)\]\s*([\s\S]+)/);
    if (sessionMatch) {
      sessionId = sessionMatch[1];
      actualMessage = sessionMatch[2];
    }

    // Ambil history dari Upstash Redis
    var history = [];
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      try {
        var r = await fetch(UPSTASH_URL + "/get/chat:" + cleanSender, {
          headers: { "Authorization": "Bearer " + UPSTASH_TOKEN }
        });
        var d = await r.json();
        if (d.result) history = JSON.parse(d.result);
      } catch(e) { history = []; }
    }

    var isNewConversation = history.length === 0;

    history.push({ role: "user", content: actualMessage });
    if (history.length > 10) history = history.slice(history.length - 10);

    var systemPrompt = "Kamu adalah Rifty Agustin, Customer Service dari Sarana Multy Logam. Kamu adalah manusia nyata, BUKAN AI atau bot.\n\n" +
      "IDENTITAS:\n" +
      "- Nama: Rifty Agustin\n" +
      "- Posisi: Customer Service Sarana Multy Logam\n" +
      "- Sifat: Ramah, hangat, sabar, profesional\n\n" +
      "PERUSAHAAN:\n" +
      "- Nama: Sarana Multy Logam\n" +
      "- Alamat: Jl. Cibuntu Tengah 1 RT 04/09, Bandung, Jawa Barat\n" +
      "- Bidang: Fabrikasi mesin industri dan UMKM\n" +
      "- WA: 6285371526068\n\n" +
      "PRODUK:\n" +
      "- Kuali/Wajan Besar (besi & stainless) berbagai ukuran\n" +
      "- Mesin Mixer/Pengaduk Adonan\n" +
      "- Mesin Penggiling/Pengolah Bahan Makanan\n" +
      "- Tangki/Bak Stainless berbagai ukuran\n" +
      "- Mesin Coating/Pelapisan\n" +
      "- Peralatan Dapur Industri\n" +
      "- Custom mesin sesuai pesanan\n\n" +
      "ATURAN WAJIB - IKUTI SEMUA TANPA KECUALI:\n" +
      "- SELALU panggil pelanggan dengan 'Kaka' di setiap balasan, JANGAN PERNAH gunakan 'kamu', 'Anda', 'anda', 'bapak', atau 'ibu'\n" +
      "- " + (isNewConversation ? "Ini percakapan BARU, boleh perkenalan singkat HANYA di kalimat pertama saja" : "Ini percakapan LANJUTAN, DILARANG KERAS perkenalan ulang, langsung jawab pertanyaan") + "\n" +
      "- JANGAN pernah menyebut 'fonnte', 'panggilan tidak kenal', atau hal teknis apapun\n" +
      "- JANGAN mengarang alamat, produk, atau harga yang tidak ada\n" +
      "- Kalau tidak tahu harga, bilang hubungi kami untuk info harga lebih lanjut\n" +
      "- Jawab singkat dan padat cocok untuk WhatsApp\n" +
      "- Gunakan emoji secukupnya\n" +
      "- Fokus jawab pertanyaan terbaru dari Kaka\n";

    var groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + GROQ_API_KEY },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1024,
        messages: [{ role: "system", content: systemPrompt }].concat(history)
      })
    });

    var groqData = await groqRes.json();
    var aiReply = (groqData.choices && groqData.choices[0] && groqData.choices[0].message && groqData.choices[0].message.content)
      ? groqData.choices[0].message.content
      : "Maaf, ada gangguan teknis. Silakan coba lagi.";

    history.push({ role: "assistant", content: aiReply });

    // Simpan history ke Upstash Redis
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      try {
        await fetch(UPSTASH_URL + "/set/chat:" + cleanSender, {
          method: "POST",
          headers: { "Authorization": "Bearer " + UPSTASH_TOKEN, "Content-Type": "application/json" },
          body: JSON.stringify({ value: JSON.stringify(history) })
        });
      } catch(e) {}
    }

    // Kirim balasan ke pengirim via Fonnte
    await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { "Authorization": FONNTE_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ target: sender, message: aiReply, countryCode: "62" })
    });

    // Jika ada sessionId (pesan dari web), simpan balasan ke JSONBin SEKALI SAJA
    if (sessionId) {
      var JSONBIN_KEY = process.env.JSONBIN_KEY;
      var JSONBIN_BIN = process.env.JSONBIN_BIN;
      if (JSONBIN_KEY && JSONBIN_BIN) {
        try {
          var getRes = await fetch("https://api.jsonbin.io/v3/b/" + JSONBIN_BIN + "/latest", {
            headers: { "X-Master-Key": JSONBIN_KEY }
          });
          var chatData = { chats: [] };
          if (getRes.ok) {
            var json = await getRes.json();
            chatData = json.record || { chats: [] };
          }
          if (!chatData.chats) chatData.chats = [];

          // Cek duplikat - jangan simpan jika pesan sama sudah ada dalam 5 detik terakhir
          var now = Date.now();
          var isDuplicate = chatData.chats.some(function(c) {
            return c.message === aiReply && c.sessionId === sessionId && (now - new Date(c.timestamp).getTime()) < 5000;
          });

          if (!isDuplicate) {
            chatData.chats.push({
              id: now,
              sessionId: sessionId,
              userId: "admin",
              userName: "Rifty Agustin",
              message: aiReply,
              from: "admin",
              timestamp: new Date().toISOString(),
              read: false
            });
            if (chatData.chats.length > 500) chatData.chats = chatData.chats.slice(-500);
            await fetch("https://api.jsonbin.io/v3/b/" + JSONBIN_BIN, {
              method: "PUT",
              headers: { "Content-Type": "application/json", "X-Master-Key": JSONBIN_KEY },
              body: JSON.stringify(chatData)
            });
          }
        } catch(e) {}
      }
    }

    return { statusCode: 200, headers: headers, body: JSON.stringify({ status: "ok", replied: true }) };

  } catch(err) {
    return { statusCode: 200, headers: headers, body: JSON.stringify({ status: "error", message: err.message }) };
  }
};
      return { statusCode: 200, headers: headers, body: JSON.stringify({ status: "ignored: self" }) };
    }

    // Parse session ID dari pesan jika ada format [SESSION_ID] pesan
    var sessionId = null;
    var actualMessage = message;
    var sessionMatch = message.match(/^\[([A-Z0-9\-]+)\]\s*([\s\S]+)/);
    if (sessionMatch) {
      sessionId = sessionMatch[1];
      actualMessage = sessionMatch[2];
    }

    var history = [];
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      try {
        var r = await fetch(UPSTASH_URL + "/get/chat:" + cleanSender, {
          headers: { "Authorization": "Bearer " + UPSTASH_TOKEN }
        });
        var d = await r.json();
        if (d.result) history = JSON.parse(d.result);
      } catch(e) { history = []; }
    }

    history.push({ role: "user", content: actualMessage });
    if (history.length > 10) history = history.slice(history.length - 10);

    var systemPrompt = "Kamu adalah Rifty Agustin, Customer Service dari Sarana Multy Logam. Kamu adalah manusia, bukan AI atau bot.\n\n" +
      "IDENTITAS:\n" +
      "- Nama: Rifty Agustin\n" +
      "- Posisi: Customer Service Sarana Multy Logam\n" +
      "- Sifat: Ramah, hangat, sabar, profesional\n\n" +
      "PERUSAHAAN:\n" +
      "- Nama: Sarana Multy Logam\n" +
      "- Alamat: Jl. Cibuntu Tengah 1 RT 04/09, Bandung, Jawa Barat\n" +
      "- Bidang: Fabrikasi mesin industri dan UMKM\n" +
      "- WA: 6285371526068\n\n" +
      "PRODUK:\n" +
      "- Kuali/Wajan Besar (besi & stainless) berbagai ukuran\n" +
      "- Mesin Mixer/Pengaduk Adonan\n" +
      "- Mesin Penggiling/Pengolah Bahan Makanan\n" +
      "- Tangki/Bak Stainless berbagai ukuran\n" +
      "- Mesin Coating/Pelapisan\n" +
      "- Peralatan Dapur Industri\n" +
      "- Custom mesin sesuai pesanan\n\n" +
      "ATURAN WAJIB:\n" +
      "- Panggil pelanggan dengan Kaka, bukan Anda atau kamu\n" +
      "- Nama Rifty HANYA disebut SEKALI seumur percakapan, tidak peduli ganti topik\n" +
      "- Jangan pernah menyebut 'panggilan via fonnte' atau 'tidak kenal'\n" +
      "- Semua pesan yang masuk adalah dari calon pelanggan, langsung layani dengan baik\n" +
      "- Pesan berikutnya langsung jawab tanpa perkenalan ulang\n" +
      "- JANGAN mengarang alamat, produk, atau harga yang tidak ada\n" +
      "- Kalau tidak tahu harga, bilang hubungi kami untuk info harga\n" +
      "- Jawab singkat dan padat cocok untuk WhatsApp\n" +
      "- Gunakan emoji secukupnya\n" +
      "- SETIAP kalimat yang ada kata 'kamu' atau 'Anda' harus diganti dengan 'Kaka'\n" +
      "- PERIKSA setiap kalimat sebelum dikirim, pastikan tidak ada kata 'kamu' atau 'Anda'\n" +
      "- Cek history chat, jika sudah ada percakapan sebelumnya LANGSUNG jawab pertanyaan tanpa salam atau perkenalan\n" +
      "- Jika history kosong, perkenalan HANYA boleh di kalimat pertama saja, setelah itu STOP\n" +
      "- INGAT: Kata 'Kaka' wajib muncul di setiap balasan\n"; 

    var groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + GROQ_API_KEY },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 1024,
        messages: [{ role: "system", content: systemPrompt }].concat(history)
      })
    });

    var groqData = await groqRes.json();
    var aiReply = (groqData.choices && groqData.choices[0] && groqData.choices[0].message && groqData.choices[0].message.content)
      ? groqData.choices[0].message.content
      : "Maaf, ada gangguan teknis. Silakan coba lagi.";

    history.push({ role: "assistant", content: aiReply });

    if (UPSTASH_URL && UPSTASH_TOKEN) {
      try {
        await fetch(UPSTASH_URL + "/set/chat:" + cleanSender, {
          method: "POST",
          headers: { "Authorization": "Bearer " + UPSTASH_TOKEN, "Content-Type": "application/json" },
          body: JSON.stringify({ value: JSON.stringify(history) })
        });
      } catch(e) {}
    }

    // Kirim balasan ke pengirim via Fonnte
    await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { "Authorization": FONNTE_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ target: sender, message: aiReply, countryCode: "62" })
    });

    // Jika ada sessionId (pesan dari web), simpan balasan ke JSONBin
    if (sessionId) {
      var JSONBIN_KEY = process.env.JSONBIN_KEY;
      var JSONBIN_BIN = process.env.JSONBIN_BIN;
      if (JSONBIN_KEY && JSONBIN_BIN) {
        try {
          var getRes = await fetch("https://api.jsonbin.io/v3/b/" + JSONBIN_BIN + "/latest", {
            headers: { "X-Master-Key": JSONBIN_KEY }
          });
          var chatData = { chats: [] };
          if (getRes.ok) {
            var json = await getRes.json();
            chatData = json.record || { chats: [] };
          }
          if (!chatData.chats) chatData.chats = [];
          chatData.chats.push({
            id: Date.now(),
            sessionId: sessionId,
            userId: "admin",
            userName: "Rifty Agustin",
            message: aiReply,
            from: "admin",
            timestamp: new Date().toISOString(),
            read: false
          });
          if (chatData.chats.length > 500) chatData.chats = chatData.chats.slice(-500);
          await fetch("https://api.jsonbin.io/v3/b/" + JSONBIN_BIN, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "X-Master-Key": JSONBIN_KEY },
            body: JSON.stringify(chatData)
          });
        } catch(e) {}
      }
    }

    return { statusCode: 200, headers: headers, body: JSON.stringify({ status: "ok", replied: true }) };

  } catch(err) {
    return { statusCode: 200, headers: headers, body: JSON.stringify({ status: "error", message: err.message }) };
  }
};
