// Debug endpoint — GET /api/debug
// Liệt kê models có sẵn và test từng provider
export default async function handler(req, res) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.Gemini_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.OpenRouter_API_KEY;

  const results = {
    env: {
      GEMINI_API_KEY: geminiKey
        ? `✅ Set (${geminiKey.length} chars, starts: ${geminiKey.substring(0, 8)}...)`
        : '❌ Not set',
      OPENROUTER_API_KEY: openrouterKey
        ? `✅ Set (${openrouterKey.length} chars, starts: ${openrouterKey.substring(0, 8)}...)`
        : '❌ Not set',
    },
    gemini_available_models: [],
    gemini_test: null,
    openrouter_test: null
  };

  // Step 1: ListModels — xem model nào còn sống
  if (geminiKey) {
    try {
      const listRes = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${geminiKey}&pageSize=50`
      );
      if (listRes.ok) {
        const listData = await listRes.json();
        results.gemini_available_models = (listData.models || [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => m.name.replace('models/', ''));
      } else {
        const err = await listRes.json();
        results.gemini_available_models = `❌ ListModels failed: ${err?.error?.message}`;
      }
    } catch (e) {
      results.gemini_available_models = `❌ Network error: ${e.message}`;
    }
  }

  // Step 2: Test model đầu tiên có sẵn
  if (geminiKey && Array.isArray(results.gemini_available_models) && results.gemini_available_models.length > 0) {
    const testModel = results.gemini_available_models[0];
    try {
      const testRes = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${testModel}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say "OK" in one word.' }] }],
            generationConfig: { maxOutputTokens: 10 }
          })
        }
      );
      const data = await testRes.json();
      if (testRes.ok) {
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        results.gemini_test = { status: `✅ SUCCESS with ${testModel}`, response: text };
      } else {
        results.gemini_test = {
          status: `❌ FAILED (HTTP ${testRes.status}) with ${testModel}`,
          error: data?.error?.message
        };
      }
    } catch (e) {
      results.gemini_test = { status: '❌ Network error', error: e.message };
    }
  } else if (geminiKey) {
    results.gemini_test = { status: '⚠️ No generateContent models found' };
  }

  // Step 3: Test OpenRouter
  if (openrouterKey) {
    const modelsToTry = [
      'deepseek/deepseek-chat-v3-0324:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'qwen/qwen3-14b:free'
    ];
    for (const model of modelsToTry) {
      try {
        const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openrouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://geotag-home-nest.vercel.app/'
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Say "OK" in one word.' }],
            max_tokens: 10
          })
        });
        const data = await orRes.json();
        if (orRes.ok) {
          const text = data?.choices?.[0]?.message?.content;
          results.openrouter_test = { status: `✅ SUCCESS with ${model}`, response: text };
          break;
        } else {
          results.openrouter_test = {
            status: `❌ FAILED (HTTP ${orRes.status}) with ${model}`,
            error: data?.error?.message || JSON.stringify(data?.error)
          };
        }
      } catch (e) {
        results.openrouter_test = { status: `❌ Network error with ${model}`, error: e.message };
      }
    }
  } else {
    results.openrouter_test = { status: '⚠️ SKIPPED — no key' };
  }

  return res.status(200).json(results);
}
