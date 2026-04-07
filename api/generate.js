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

  // Danh sách Models ưu tiên
  const tryQueue = [];
  if (geminiKey) {
    tryQueue.push({ provider: 'gemini', model: 'gemini-2.0-flash', key: geminiKey });
    tryQueue.push({ provider: 'gemini', model: 'gemini-2.0-flash-lite', key: geminiKey });
  }
  if (openrouterKey) {
    tryQueue.push({ provider: 'openrouter', model: 'openrouter/free', key: openrouterKey });
    tryQueue.push({ provider: 'openrouter', model: 'google/gemini-2.0-pro-exp-0205:free', key: openrouterKey });
  }
  const maxAttempts = 3;
  let lastError = null;

  // Attempt loops with exponential backoff for rate limits
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (const item of tryQueue) {
      const { provider, model, key } = item;
      try {
        console.log(`[API] Attempt ${attempt}: trying ${provider} model ${model}...`);
        
        let response;
        if (provider === 'gemini') {
           const parts = [{ text: prompt }];

           for (const thumb of imageThumbnails) {
             if (thumb) {
               const base64 = thumb.split(',')[1];
               if (base64) {
                 parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
               }
             }
           }

           const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
           response = await fetch(url, {
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
           });
        } else {
           const content = [{ type: 'text', text: prompt }];
           for (const thumb of imageThumbnails) {
             if (thumb) {
               content.push({ type: 'image_url', image_url: { url: thumb } });
             }
           }

           response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
             method: 'POST',
             headers: {
               'Authorization': `Bearer ${key}`,
               'Content-Type': 'application/json',
               'HTTP-Referer': 'https://geotag-home-nest.vercel.app/'
             },
             body: JSON.stringify({
               model: model,
               messages: [{ role: 'user', content }],
               temperature: 0.7,
               max_tokens: 4096
             })
           });
        }

        if (!response.ok) {
          const errText = await response.text();
          let msg = `API Error: ${response.status}`;
          try {
            const errObj = JSON.parse(errText);
            msg = errObj.error?.message || msg;
          } catch (e) {}
          
          if (response.status === 429 || msg.includes('quota') || msg.includes('rate') || msg.includes('exhausted')) {
            console.warn(`[API] ${provider} ${model}: rate limited. (${response.status})`);
            lastError = new Error(`${provider} quota exceeded. ${msg}`);
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            continue; 
          }
          if (response.status === 402 && provider === 'openrouter') {
             console.warn(`[API] OpenRouter needs credits.`);
             continue;
          }
          if (msg.includes('not found') || msg.includes('not supported')) {
            lastError = new Error(`${model}: not available. ${msg}`);
            continue;
          }
          throw new Error(msg);
        }

        const data = await response.json();
        let text;
        if (provider === 'gemini') {
           text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        } else {
           text = data?.choices?.[0]?.message?.content;
        }
        
        if (!text) {
          throw new Error(`Empty response from ${provider} model`);
        }

        return res.status(200).json({ text, provider: `Server/${provider}` });

      } catch (err) {
        console.error(`[API] Error with ${model}:`, err.message);
        if (err.message.includes('quota') || err.message.includes('not available')) {
          lastError = err;
          continue;
        }
        return res.status(500).json({ error: err.message });
      }
    }
  }

  return res.status(429).json({ error: lastError?.message || 'All models and retries failed' });
}
