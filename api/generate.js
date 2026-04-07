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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'API Key not configured on the server. Please add GEMINI_API_KEY to Vercel Environment Variables.' 
    });
  }

  const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
  const maxAttempts = 3;
  let lastError = null;

  // Attempt loops with exponential backoff for 429
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (const model of models) {
      try {
        console.log(`[API] Gemini Attempt ${attempt}: trying ${model}...`);
        const parts = [{ text: prompt }];

        for (const thumb of imageThumbnails) {
          if (thumb) {
            const base64 = thumb.split(',')[1];
            if (base64) {
              parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
            }
          }
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4096,
              // Force JSON output
              responseMimeType: 'application/json'
            }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          let msg = `API Error: ${response.status}`;
          try {
            const errObj = JSON.parse(errText);
            msg = errObj.error?.message || msg;
          } catch (e) {}
          
          if (response.status === 429 || msg.includes('quota') || msg.includes('rate') || msg.includes('exhausted')) {
            console.warn(`[API] Gemini ${model}: rate limited. (${response.status})`);
            lastError = new Error(`Gemini quota exceeded. ${msg}`);
            // Wait 2s, 4s, 6s... before trying the next model
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            continue; 
          }
          if (msg.includes('not found') || msg.includes('not supported')) {
            lastError = new Error(`${model}: not available. ${msg}`);
            continue;
          }
          throw new Error(msg);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
          throw new Error('Empty response from model');
        }

        return res.status(200).json({ text, provider: 'ServerGemini' });

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
