export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt, imageThumbnails = [] } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.Gemini_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.OpenRouter_API_KEY;

  if (!geminiKey && !openrouterKey) {
    return res.status(500).json({
      error: 'Vui lòng cài đặt GEMINI_API_KEY hoặc OPENROUTER_API_KEY trên Vercel.'
    });
  }

  // Danh sách Models ưu tiên — chỉ dùng các model đã xác nhận hoạt động
  const tryQueue = [];
  if (geminiKey) {
    tryQueue.push({ provider: 'gemini', model: 'gemini-1.5-flash',    key: geminiKey });
    tryQueue.push({ provider: 'gemini', model: 'gemini-1.5-flash-8b', key: geminiKey });
    tryQueue.push({ provider: 'gemini', model: 'gemini-1.5-pro',      key: geminiKey });
  }
  if (openrouterKey) {
    tryQueue.push({ provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free', key: openrouterKey });
    tryQueue.push({ provider: 'openrouter', model: 'google/gemini-flash-1.5:free',            key: openrouterKey });
    tryQueue.push({ provider: 'openrouter', model: 'mistralai/mistral-7b-instruct:free',      key: openrouterKey });
  }

  let lastError = null;

  for (const item of tryQueue) {
    const { provider, model, key } = item;
    try {
      console.log(`[API] Trying ${provider}/${model}...`);

      let response;

      if (provider === 'gemini') {
        const parts = [{ text: prompt }];
        for (const thumb of imageThumbnails) {
          if (thumb) {
            const base64 = thumb.split(',')[1];
            if (base64) parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
          }
        }
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4096,
                responseMimeType: 'application/json'
              }
            })
          }
        );
      } else {
        const content = [{ type: 'text', text: prompt }];
        for (const thumb of imageThumbnails) {
          if (thumb) content.push({ type: 'image_url', image_url: { url: thumb } });
        }
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://geotag-home-nest.vercel.app/'
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content }],
            temperature: 0.7,
            max_tokens: 4096
          })
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        let msg = `HTTP ${response.status}`;
        try {
          const errObj = JSON.parse(errText);
          msg = errObj.error?.message || errObj.message || msg;
        } catch (_) {}

        console.warn(`[API] ${provider}/${model} failed: ${response.status} — ${msg.substring(0, 120)}`);
        lastError = new Error(`${model}: ${msg}`);

        // Rate limit — backoff rồi thử model tiếp
        if (response.status === 429) {
          await new Promise(r => setTimeout(r, 2000));
        }
        continue; // <-- LUÔN thử model tiếp, không throw
      }

      const data = await response.json();
      let text;
      if (provider === 'gemini') {
        text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      } else {
        text = data?.choices?.[0]?.message?.content;
      }

      if (!text) {
        console.warn(`[API] ${provider}/${model} returned empty text, trying next...`);
        lastError = new Error(`Empty response from ${model}`);
        continue;
      }

      console.log(`[API] ✅ Success with ${provider}/${model}`);
      return res.status(200).json({ text, provider: `Server/${provider}` });

    } catch (err) {
      // Network-level error (timeout, DNS, etc.) — tiếp tục sang model khác
      console.error(`[API] Network error with ${provider}/${model}:`, err.message);
      lastError = err;
      continue;
    }
  }

  // Tất cả model đều thất bại
  const errMsg = lastError?.message || 'All AI models failed';
  console.error('[API] All models exhausted:', errMsg);
  return res.status(503).json({ error: errMsg });
}
