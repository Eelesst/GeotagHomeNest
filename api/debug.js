// Debug endpoint — truy cập: GET /api/debug
// Trả về kết quả test chi tiết từng provider
export default async function handler(req, res) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.Gemini_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.OpenRouter_API_KEY;

  const results = {
    env: {
      GEMINI_API_KEY: geminiKey ? `✅ Set (${geminiKey.length} chars, starts: ${geminiKey.substring(0, 6)}...)` : '❌ Not set',
      OPENROUTER_API_KEY: openrouterKey ? `✅ Set (${openrouterKey.length} chars, starts: ${openrouterKey.substring(0, 6)}...)` : '❌ Not set',
    },
    gemini: null,
    openrouter: null
  };

  // Test Gemini API
  if (geminiKey) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say "OK" in one word.' }] }],
            generationConfig: { maxOutputTokens: 10 }
          })
        }
      );
      const data = await geminiRes.json();
      if (geminiRes.ok) {
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        results.gemini = { status: '✅ SUCCESS', model: 'gemini-1.5-flash', response: text };
      } else {
        results.gemini = {
          status: `❌ FAILED (HTTP ${geminiRes.status})`,
          model: 'gemini-1.5-flash',
          error: data?.error?.message || data?.error?.status || JSON.stringify(data).substring(0, 300)
        };
      }
    } catch (err) {
      results.gemini = { status: '❌ NETWORK ERROR', error: err.message };
    }
  } else {
    results.gemini = { status: '⚠️ SKIPPED — no key' };
  }

  // Test OpenRouter API
  if (openrouterKey) {
    try {
      const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://geotag-home-nest.vercel.app/'
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          messages: [{ role: 'user', content: 'Say "OK" in one word.' }],
          max_tokens: 10
        })
      });
      const data = await orRes.json();
      if (orRes.ok) {
        const text = data?.choices?.[0]?.message?.content;
        results.openrouter = { status: '✅ SUCCESS', model: 'meta-llama/llama-3.3-70b-instruct:free', response: text };
      } else {
        results.openrouter = {
          status: `❌ FAILED (HTTP ${orRes.status})`,
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          error: data?.error?.message || data?.error || JSON.stringify(data).substring(0, 300)
        };
      }
    } catch (err) {
      results.openrouter = { status: '❌ NETWORK ERROR', error: err.message };
    }
  } else {
    results.openrouter = { status: '⚠️ SKIPPED — no key' };
  }

  return res.status(200).json(results);
}
