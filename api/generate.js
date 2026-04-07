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

  // Queue covers cả dòng model cũ lẫn mới — tự động fallback
  const tryQueue = [];
  if (geminiKey) {
    // Dòng 2.0 (mới nhất cho tài khoản mới)
    tryQueue.push({ provider: 'gemini', model: 'gemini-2.0-flash-lite',          apiVersion: 'v1',     key: geminiKey });
    tryQueue.push({ provider: 'gemini', model: 'gemini-2.0-flash-lite-001',       apiVersion: 'v1',     key: geminiKey });
    tryQueue.push({ provider: 'gemini', model: 'gemini-2.5-flash-preview-04-17',  apiVersion: 'v1beta', key: geminiKey });
    // Dòng 1.5 (tài khoản cũ)
    tryQueue.push({ provider: 'gemini', model: 'gemini-1.5-flash',               apiVersion: 'v1',     key: geminiKey });
    tryQueue.push({ provider: 'gemini', model: 'gemini-1.5-flash-8b',            apiVersion: 'v1',     key: geminiKey });
    tryQueue.push({ provider: 'gemini', model: 'gemini-1.5-pro',                 apiVersion: 'v1',     key: geminiKey });
  }
  if (openrouterKey) {
    tryQueue.push({ provider: 'openrouter', model: 'deepseek/deepseek-chat-v3-0324:free',       key: openrouterKey });
    tryQueue.push({ provider: 'openrouter', model: 'google/gemini-2.0-flash-thinking-exp:free', key: openrouterKey });
    tryQueue.push({ provider: 'openrouter', model: 'qwen/qwen3-14b:free',                       key: openrouterKey });
    tryQueue.push({ provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free',    key: openrouterKey });
  }

  let lastError = null;

  for (const item of tryQueue) {
    const { provider, model, apiVersion, key } = item;
    try {
      console.log(`[API] Trying ${provider}/${model}${apiVersion ? ` (${apiVersion})` : ''}...`);

      let response;

      if (provider === 'gemini') {
        const parts = [{ text: prompt }];
        for (const thumb of imageThumbnails) {
          if (thumb) {
            const base64 = thumb.split(',')[1];
            if (base64) parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
          }
        }
        const ver = apiVersion || 'v1';
        response = await fetch(
          `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
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

        if (response.status === 429) {
          await new Promise(r => setTimeout(r, 1500));
        }
        continue; // luôn thử model tiếp theo
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
      console.error(`[API] Network error with ${provider}/${model}:`, err.message);
      lastError = err;
      continue;
    }
  }

  const errMsg = lastError?.message || 'All AI models failed';
  console.error('[API] All models exhausted:', errMsg);
  return res.status(503).json({ error: errMsg });
}
