/**
 * AIProvider - Multi-provider LLM abstraction for generating SEO metadata
 * 
 * Supports:
 * - Google Gemini (primary, free tier)
 * - OpenRouter (backup, free models)
 * - Offline SmartTagGenerator (final fallback)
 * 
 * Features:
 * - Project Context aware prompts
 * - Batch processing with rate limiting
 * - Vision mode (send image thumbnails)
 * - Automatic fallback chain
 */
const AIProvider = {

  // Provider configurations
  providers: {
    gemini: {
      name: 'Google Gemini',
      models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'],
      supportsVision: true,
      keyPlaceholder: 'Google AI Studio API Key',
      keyHelpUrl: 'https://aistudio.google.com/apikey'
    },
    openrouter: {
      name: 'OpenRouter',
      models: ['openrouter/free', 'nvidia/llama-3.3-nemotron-super-49b-v1:free', 'qwen/qwen3.6-plus-preview:free', 'meta-llama/llama-3.3-70b-instruct:free'],
      supportsVision: true,
      keyPlaceholder: 'OpenRouter API Key',
      keyHelpUrl: 'https://openrouter.ai/keys'
    }
  },

  // Default project context template
  defaultProjectContext: {
    industry: '',
    description: '',
    brand: '',
    mainKeywords: '',
    language: 'vi',  // 'vi', 'en', 'both'
    visionMode: false
  },

  /**
   * Build SEO-optimized prompt with project context
   * @param {Array} images - Image objects with filename and existing metadata
   * @param {Object} projectContext - User's project context
   * @returns {string} Structured prompt
   */
  buildPrompt(images, projectContext) {
    const { industry, description, brand, mainKeywords, language } = projectContext;

    // Build strict language instruction
    let langInstruction;
    let langStrictRule;
    if (language === 'vi') {
      langInstruction = 'Vietnamese ONLY (tiếng Việt hoàn toàn)';
      langStrictRule = 'CRITICAL LANGUAGE RULE: ALL tags, comment, title, subject MUST be in Vietnamese ONLY. Do NOT add any English words unless they are internationally recognized terms (e.g., brand names, technical acronyms like SEO, AI, etc.).';
    } else if (language === 'en') {
      langInstruction = 'English ONLY';
      langStrictRule = 'CRITICAL LANGUAGE RULE: ALL tags, comment, title, subject MUST be in English ONLY. Do NOT add any Vietnamese words. Do not mix languages.';
    } else {
      langInstruction = 'Both Vietnamese AND English (mix naturally)';
      langStrictRule = 'Include both Vietnamese and English keywords for bilingual SEO.';
    }

    // Build brand protection rule
    let brandRule = '';
    if (brand) {
      brandRule = `\nBRAND PROTECTION RULE: The brand name "${brand}" MUST always appear as a SINGLE unified tag, never split into parts. For example, "HomeNest Software" stays as "HomeNest Software" — do NOT split into "HomeNest", "Nest", "Software" as separate tags.`;
    }

    const imageList = images.map((img, i) => {
      const parsed = FilenameParser.parse(img.filename);
      const rawFilename = img.filename.replace(/\.[^.]+$/, ''); // filename without extension
      return `${i + 1}. Filename: "${rawFilename}" | Display title: "${parsed.title}"${img.metadata.tags ? ` | existing tags: ${img.metadata.tags.substring(0, 80)}` : ''}`;
    }).join('\n');

    // Build context section only if user provided info
    let contextSection = '';
    if (industry || description || brand || mainKeywords) {
      contextSection = `\n## Business Context`;
      if (brand) contextSection += `\n- Brand: ${brand} (treat as one unified keyword, do not split)`;
      if (industry) contextSection += `\n- Industry: ${industry}`;
      if (description) contextSection += `\n- Description: ${description}`;
      if (mainKeywords) contextSection += `\n- Main keywords: ${mainKeywords}`;
      contextSection += '\n';
    }

    return `You are an SEO metadata specialist.
${contextSection}
## Task
Generate SEO-optimized **tags** and **comment** ONLY for ${images.length} image(s). Analyze the filename carefully to understand the topic:
${imageList}

## For EACH image, generate:
1. **tags** (15-20 keywords): derived from the filename, main keywords, long-tail variations, industry terms${brand ? `, always include "${brand}" as one tag` : ''}. Do NOT blindly split compound words in filenames — treat them as a phrase first.
2. **comment** (120-160 chars): natural meta description with primary keyword near start. MUST be non-empty for every image.

## Language
${langInstruction}
${langStrictRule}${brandRule}

## Output format (REQUIRED)
Return ONLY a valid JSON object with an "images" array containing EXACTLY ${images.length} items:
{
  "images": [
    {"tags": ["keyword1", "keyword2"], "comment": "Description for image 1"},
    {"tags": ["keyword1", "keyword2"], "comment": "Description for image 2"}
  ]
}

RULES:
- The "images" array MUST have EXACTLY ${images.length} object(s) — one per image in the exact order listed above.
- Every "comment" field MUST be a non-empty string (120-160 chars).
- Return ONLY the JSON object. No markdown, no code blocks, no extra text.`;
  },

  /**
   * Create a small thumbnail for Vision API
   * @param {string} dataURL - Original image data URL
   * @param {number} maxSize - Max dimension in pixels
   * @returns {Promise<string>} Resized data URL
   */
  createThumbnail(dataURL, maxSize = 256) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > h) {
          if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
        } else {
          if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => resolve(null);
      img.src = dataURL;
    });
  },

  /**
   * Helper to generate a cache key
   */
  _generateCacheKey(img, projectContext) {
    // Basic hash of the filename
    const nameStr = img.filename;
    // Include context to avoid stale cache across different niches
    const ctxString = `${projectContext.industry}_${projectContext.brand}_${projectContext.language}`;
    return `geotag_ai_${btoa(unescape(encodeURIComponent(nameStr + ctxString))).substring(0, 32)}`;
  },

  /**
   * Call Vercel Serverless API
   * @param {string} prompt - Text prompt
   * @param {Array<string>} imageThumbnails - Optional thumbnails for Vision
   * @returns {Promise<Object>} Parsed JSON response
   */
  async callServerless(prompt, imageThumbnails = []) {
    console.log(`[AI] Calling Vercel Serverless Endpoint...`);

    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, imageThumbnails })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server API Error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.text) throw new Error('Empty response from Serverless Endpoint');

    console.log(`[AI] ✅ Serverless ${data.provider || 'Success'}`);
    return this._parseJSON(data.text);
  },

  /**
   * Call Gemini API directly from browser (dùng khi chạy localhost)
   * @param {string} prompt
   * @param {Array<string>} imageThumbnails
   * @param {string} apiKey - Google AI Studio API key
   * @returns {Promise<Object>} Parsed JSON response
   */
  async callDirectBrowser(prompt, imageThumbnails = [], apiKey) {
    const models = [
      { name: 'gemini-2.5-flash',      ver: 'v1beta' },
      { name: 'gemini-2.0-flash',      ver: 'v1'     },
      { name: 'gemini-2.0-flash-lite', ver: 'v1'     }
    ];

    let lastError = 'Không rõ lỗi';

    for (const { name, ver } of models) {
      try {
        console.log(`[AI] Direct browser call: ${name} (${ver})...`);

        const parts = [{ text: prompt }];
        for (const thumb of imageThumbnails) {
          if (thumb) {
            const base64 = thumb.split(',')[1];
            if (base64) parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
          }
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/${ver}/models/${name}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
            })
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          let apiMsg = `HTTP ${response.status}`;
          try {
            const errObj = JSON.parse(errText);
            apiMsg = errObj.error?.message || apiMsg;
          } catch(_) {}
          lastError = `[${name}] ${apiMsg}`;
          console.warn(`[AI] ${name} failed (${response.status}): ${apiMsg}`);
          if (response.status === 429) await this._sleep(1500);
          continue;
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          lastError = `[${name}] Response rỗng`;
          console.warn(`[AI] ${name} returned empty text`);
          continue;
        }

        console.log(`[AI] ✅ Direct browser call success: ${name}`);
        return this._parseJSON(text);

      } catch (err) {
        lastError = `[${name}] ${err.message}`;
        console.warn(`[AI] Network/CORS error ${name}:`, err.message);
      }
    }

    throw new Error(lastError);
  },

  /**
   * Call OpenRouter API directly from browser
   * @param {string} prompt
   * @param {Array<string>} imageThumbnails
   * @param {string} apiKey - OpenRouter API key
   * @returns {Promise<Object>} Parsed JSON response
   */
  async callDirectOpenRouter(prompt, imageThumbnails = [], apiKey) {
    const models = [
      'meta-llama/llama-3.3-70b-instruct:free',
      'qwen/qwen3-8b:free',
      'mistralai/mistral-7b-instruct:free'
    ];

    let lastError = 'Không rõ lỗi';

    for (const model of models) {
      try {
        console.log(`[AI] OpenRouter direct: ${model}...`);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': window.location.origin || 'https://geotag-home-nest.vercel.app',
            'X-Title': 'HomeNest Geotag'
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096,
            temperature: 0.7
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          let apiMsg = `HTTP ${response.status}`;
          try { apiMsg = JSON.parse(errText).error?.message || apiMsg; } catch(_) {}
          lastError = `[${model}] ${apiMsg}`;
          console.warn(`[AI] OpenRouter ${model} failed (${response.status}): ${apiMsg}`);
          if (response.status === 429) await this._sleep(1500);
          continue;
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (!text) {
          lastError = `[${model}] Response rỗng`;
          continue;
        }

        console.log(`[AI] ✅ OpenRouter success: ${model}`);
        return this._parseJSON(text);

      } catch (err) {
        lastError = `[${model}] ${err.message}`;
        console.warn(`[AI] OpenRouter error ${model}:`, err.message);
      }
    }

    throw new Error(lastError);
  },

  /**
   * Call 9router local endpoint (OpenAI-compatible API with gemini/ model prefix)
   * @param {string} prompt
   * @param {Array<string>} imageThumbnails
   * @param {string} apiKey - 9router API key (from Endpoint page)
   * @param {string} baseUrl - 9router base URL (default: http://localhost:20128/v1)
   * @returns {Promise<Object>} Parsed JSON response
   */
  async callNineRouter(prompt, imageThumbnails = [], apiKey, baseUrl = 'http://localhost:20128/v1') {
    const models = [
      'gemini/gemini-2.5-flash',
      'gemini/gemini-2.0-flash',
      'gemini/gemini-2.0-flash-lite'
    ];

    let lastError = 'Không rõ lỗi';
    const endpoint = baseUrl.replace(/\/$/, '') + '/chat/completions';

    for (const model of models) {
      try {
        console.log(`[AI] 9router: ${model} via ${endpoint}...`);

        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096,
            temperature: 0.7
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          let apiMsg = `HTTP ${response.status}`;
          try { apiMsg = JSON.parse(errText).error?.message || apiMsg; } catch(_) {}
          lastError = `[${model}] ${apiMsg}`;
          console.warn(`[AI] 9router ${model} failed (${response.status}): ${apiMsg}`);
          if (response.status === 429) await this._sleep(1500);
          continue;
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (!text) {
          lastError = `[${model}] Response rỗng`;
          continue;
        }

        console.log(`[AI] ✅ 9router success: ${model}`);
        return this._parseJSON(text);

      } catch (err) {
        lastError = `[${model}] ${err.message}`;
        console.warn(`[AI] 9router error ${model}:`, err.message);
      }
    }

    throw new Error(lastError);
  },

  /**
   * Test a provider with a minimal request
   * @param {string} providerName - 'gemini' | 'openrouter' | '9router'
   * @param {string} apiKey
   * @param {string} [baseUrl] - for 9router only
   * @returns {Promise<{ok: boolean, model?: string, error?: string}>}
   */
  async testProvider(providerName, apiKey, baseUrl) {
    if (providerName !== '9router' && !apiKey) return { ok: false, error: 'Chưa nhập API Key' };

    try {
      if (providerName === 'gemini') {
        const testModels = [
          { name: 'gemini-2.5-flash', ver: 'v1beta' },
          { name: 'gemini-2.0-flash', ver: 'v1' }
        ];
        let lastErr = 'Không thể kết nối';

        for (const { name, ver } of testModels) {
          try {
            const r = await fetch(
              `https://generativelanguage.googleapis.com/${ver}/models/${name}:generateContent?key=${apiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: 'Hi' }] }],
                  generationConfig: { maxOutputTokens: 10 }
                })
              }
            );
            if (r.ok) return { ok: true, model: name };
            const errText = await r.text();
            try { lastErr = JSON.parse(errText).error?.message || `HTTP ${r.status}`; } catch(_) { lastErr = `HTTP ${r.status}`; }
          } catch(_) { lastErr = 'Network error'; }
        }
        return { ok: false, error: lastErr };

      } else if (providerName === 'openrouter') {
        const model = 'meta-llama/llama-3.3-70b-instruct:free';
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': window.location.origin || 'https://geotag-home-nest.vercel.app',
            'X-Title': 'HomeNest Geotag'
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 10
          })
        });
        if (r.ok) return { ok: true, model };
        const errText = await r.text();
        let errMsg = `HTTP ${r.status}`;
        try { errMsg = JSON.parse(errText).error?.message || errMsg; } catch(_) {}
        return { ok: false, error: errMsg };

      } else if (providerName === '9router') {
        const endpoint = (baseUrl || 'http://localhost:20128/v1').replace(/\/$/, '') + '/chat/completions';
        const model = 'gemini/gemini-2.5-flash';
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        const r = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 10
          })
        });
        if (r.ok) return { ok: true, model };
        const errText = await r.text();
        let errMsg = `HTTP ${r.status}`;
        try { errMsg = JSON.parse(errText).error?.message || errMsg; } catch(_) {}
        return { ok: false, error: errMsg };
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: 'Unknown provider' };
  },

  /**
   * Call providers in preference order, returning first success
   * @returns {Promise<{result: Object|null, provider: string|null, error: Error|null}>}
   */
  async _callWithFallback(prompt, thumbnails, preferred, geminiKey, openrouterKey, ninerouterKey, ninerouterBaseUrl) {
    const order = [];

    const add9router = () => {
      if (ninerouterKey || ninerouterBaseUrl) {
        order.push({ type: '9router', key: ninerouterKey, baseUrl: ninerouterBaseUrl, label: '9router' });
      }
    };
    const addGemini = () => {
      if (geminiKey) order.push({ type: 'gemini', key: geminiKey, label: 'Gemini Direct' });
    };
    const addOpenRouter = () => {
      if (openrouterKey) order.push({ type: 'openrouter', key: openrouterKey, label: 'OpenRouter Direct' });
    };

    if (preferred === '9router') {
      add9router(); addGemini(); addOpenRouter();
    } else if (preferred === 'openrouter') {
      addOpenRouter(); addGemini(); add9router();
    } else if (preferred === 'gemini') {
      addGemini(); add9router(); addOpenRouter();
    } else {
      // auto: 9router first (local, free), then Gemini, then OpenRouter
      add9router(); addGemini(); addOpenRouter();
    }

    if (order.length === 0) {
      return { result: null, provider: null, error: new Error('Chưa nhập API Key. Vào provider bar → nhập key.') };
    }

    let lastError;
    for (const p of order) {
      try {
        let result;
        if (p.type === 'gemini') {
          result = await this.callDirectBrowser(prompt, thumbnails, p.key);
        } else if (p.type === 'openrouter') {
          result = await this.callDirectOpenRouter(prompt, thumbnails, p.key);
        } else {
          result = await this.callNineRouter(prompt, thumbnails, p.key, p.baseUrl);
        }
        return { result, provider: p.label, error: null };
      } catch (err) {
        lastError = err;
        console.warn(`[AI] ${p.label} failed:`, err.message);
      }
    }
    return { result: null, provider: null, error: lastError };
  },

  /**
   * Main entry point: process images with AI using fallback chain
   * Local Cache -> Serverless API -> Offline
   *
   * @param {Array} images - Image objects from app state
   * @param {Object} config - { projectContext, forceIgnoreCache, apiKey, openrouterKey, preferredProvider }
   * @param {Function} onProgress - Progress callback (percentage, message)
   * @returns {Promise<{results: Array, provider: string}>}
   */
  async processImages(images, config, onProgress) {
    const {
      projectContext, forceIgnoreCache,
      apiKey = '', openrouterKey = '',
      ninerouterKey = '', ninerouterBaseUrl = 'http://localhost:20128/v1',
      preferredProvider = 'auto'
    } = config;
    const batchSize = 5;
    const finalResults = new Array(images.length).fill(null);
    let usedProvider = 'Local Cache';
    
    // Step 1: Check cache for each image
    const uncachedIndices = [];
    
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const cacheKey = this._generateCacheKey(img, projectContext);
      
      let hit = null;
      if (!forceIgnoreCache) {
        try {
          const cachedStr = localStorage.getItem(cacheKey);
          if (cachedStr) {
            hit = JSON.parse(cachedStr);
          }
        } catch(e) {}
      }
      
      if (hit && hit.tags && hit.comment) {
        console.log(`[AI] Cache HIT for image: ${img.filename}`);
        finalResults[i] = hit;
      } else {
        uncachedIndices.push(i);
      }
    }
    
    if (uncachedIndices.length === 0) {
      onProgress(100, `Hoàn thành từ Local Cache...`);
      return { results: finalResults, provider: 'Local Cache' };
    }

    // Step 2: Extract uncached images
    const uncachedImages = uncachedIndices.map(idx => images[idx]);
    usedProvider = 'Serverless API';

    // Prepare thumbnails if vision mode
    let thumbnails = [];
    if (projectContext.visionMode && uncachedImages.length <= 10) {
      onProgress(5, 'Đang tạo thumbnails cho Vision AI...');
      for (const img of uncachedImages) {
        const thumb = await this.createThumbnail(img.dataURL, 256);
        thumbnails.push(thumb);
      }
      console.log(`[AI] Created ${thumbnails.length} thumbnails for Vision`);
    }

    // Split into batches
    const batches = [];
    for (let i = 0; i < uncachedImages.length; i += batchSize) {
      batches.push({
        images: uncachedImages.slice(i, i + batchSize),
        thumbnails: thumbnails.slice(i, i + batchSize),
        originalIndices: uncachedIndices.slice(i, i + batchSize)
      });
    }

    let processed = images.length - uncachedImages.length;
    let lastApiError = null;

    // Detect file:// protocol — browser blocks all external fetch() calls
    const isFileProtocol = window.location.protocol === 'file:';
    // Detect localhost — can call external APIs but serverless endpoint doesn't exist
    const isLocalhost = window.location.hostname === 'localhost' ||
                        window.location.hostname === '127.0.0.1' ||
                        isFileProtocol;

    for (const batch of batches) {
      const prompt = this.buildPrompt(batch.images, projectContext);
      let batchResults = null;
      const visionThumbs = projectContext.visionMode ? batch.thumbnails : [];

      if (isFileProtocol) {
        // file:// protocol — browser blocks all external fetch() calls
        lastApiError = new Error(
          'Mở tool qua HTTP server để dùng AI Mode.\n' +
          'Cách nhanh nhất: dùng VS Code Live Server hoặc chạy:\n' +
          'npx serve . -p 3000'
        );
        console.warn('[AI] file:// protocol blocks external API calls');

      } else if (isLocalhost) {
        // Localhost: skip serverless, use direct API keys with provider preference
        console.log(`[AI] Localhost — preferred: ${preferredProvider}`);
        const { result, provider, error } = await this._callWithFallback(
          prompt, visionThumbs, preferredProvider, apiKey, openrouterKey, ninerouterKey, ninerouterBaseUrl
        );
        if (result) {
          batchResults = result;
          usedProvider = provider;
        } else {
          lastApiError = error;
        }

      } else {
        // Production (Vercel): try serverless first, then fallback to direct API keys
        try {
          batchResults = await this.callServerless(prompt, visionThumbs);
          usedProvider = 'Serverless';
        } catch (serverlessErr) {
          console.warn('[AI] Serverless failed:', serverlessErr.message);
          const { result, provider, error } = await this._callWithFallback(
            prompt, visionThumbs, preferredProvider, apiKey, openrouterKey, ninerouterKey, ninerouterBaseUrl
          );
          if (result) {
            batchResults = result;
            usedProvider = provider;
          } else {
            lastApiError = error || serverlessErr;
          }
        }
      }

      // Fallback to offline for this batch
      if (!batchResults) {
        usedProvider = (usedProvider === 'Serverless API' || usedProvider === 'Local Cache')
          ? 'Offline' : usedProvider;
        batchResults = batch.images.map(() => null);
      }

      // Normalize results
      const normalized = this._normalizeResults(batchResults, batch.images.length);
      
      // Merge results into final array and update cache
      normalized.forEach((res, localIdx) => {
        const globalIdx = batch.originalIndices[localIdx];
        finalResults[globalIdx] = res;
        
        // Cache successful results
        if (res && res.tags && res.comment) {
           const cacheKey = this._generateCacheKey(images[globalIdx], projectContext);
           try {
             localStorage.setItem(cacheKey, JSON.stringify(res));
           } catch(e) {}
        }
      });

      processed += batch.images.length;
      const pct = Math.round((processed / images.length) * 90) + 10;
      onProgress(pct, `AI đang xử lý ${processed}/${images.length}... (${usedProvider})`);

      // Rate limiting between batches
      if (batches.indexOf(batch) < batches.length - 1) {
        await this._sleep(1500);
      }
    }

    return { results: finalResults, provider: usedProvider, error: lastApiError };
  },

  /**
   * Merge AI results into image metadata (fill-only, don't overwrite)
   * @param {Array} images - Image objects
   * @param {Array} results - AI results
   */
  mergeResults(images, results) {
    results.forEach((result, i) => {
      if (i >= images.length) return;
      const img = images[i];
      if (!result) return; // Skip if null (offline fallback marker)

      let hasValidAiOutput = false;

      // Tags: ALWAYS merge (add AI tags to existing, no duplicates)
      if (result.tags && result.tags.length > 0) {
        const existing = (img.metadata.tags || '')
          .split(';').map(t => t.trim()).filter(Boolean);
        const existingLower = new Set(existing.map(t => t.toLowerCase()));
        const newTags = result.tags
          .map(t => t.trim())
          .filter(t => t && !existingLower.has(t.toLowerCase()));
        img.metadata.tags = [...existing, ...newTags].join('; ');
        hasValidAiOutput = true;
      }

      // BUG FIX #1: Title & Subject — AI only FILLS if empty, never overrides user/filename values
      if (result.title && !img.metadata.title) {
        img.metadata.title = result.title;
        hasValidAiOutput = true;
      }

      if (result.subject && !img.metadata.subject) {
        img.metadata.subject = result.subject;
        hasValidAiOutput = true;
      }

      // Comment: AI ALWAYS overrides when it returns a non-empty comment.
      if (result.comment) {
        img.metadata.comment = result.comment;
        hasValidAiOutput = true;
      }

      // Mark as AI-processed so SmartTagGenerator skips comment for this image
      if (hasValidAiOutput) {
        img.aiProcessed = true;
      }
    });
  },

  // ==================== INTERNAL HELPERS ====================

  /**
   * Internal Helper: Decode Provider order
   * (Deprectated in Serverless architecture, but kept for structural purity)
   */
  _getProviderOrder(preferred) {
    return ['serverless'];
  },

  /**
   * Parse JSON from LLM response (handles markdown fences, etc.)
   * Supports both wrapped format {"images": [...]} and bare arrays [...]
   */
  _parseJSON(text) {
    const clean = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // Attempt 1: direct parse
    try {
      const parsed = JSON.parse(clean);
      // Prefer { images: [...] } wrapper format
      if (parsed && Array.isArray(parsed.images)) return parsed.images;
      if (Array.isArray(parsed)) return parsed;
      // Single object or other formats — wrap in array
      return [parsed];
    } catch (e) {
      console.warn('[AI] JSON parse failed, trying extraction strategies');
    }

    // Attempt 2: find {"images": [...]} pattern
    const wrappedMatch = clean.match(/\{[\s\S]*?"images"\s*:\s*(\[[\s\S]*?\])[\s\S]*?\}/);
    if (wrappedMatch) {
      try { return JSON.parse(wrappedMatch[1]); } catch (e2) { /* continue */ }
    }

    // Attempt 3: find bare JSON array [...]
    const arrayMatch = clean.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try { return JSON.parse(arrayMatch[0]); } catch (e3) { /* continue */ }
    }

    // Attempt 4: extract individual objects with "tags" field
    const results = [];
    const objRegex = /\{[^{}]*"tags"\s*:\s*\[[^\]]*\][^{}]*\}/g;
    let match;
    while ((match = objRegex.exec(clean)) !== null) {
      try { results.push(JSON.parse(match[0])); } catch (e4) { /* skip */ }
    }
    if (results.length > 0) return results;

    throw new Error('Could not parse LLM response as JSON');
  },

  /**
   * Normalize results to ensure correct structure
   * Handles both the new {"images":[...]} wrapper format and raw arrays
   */
  _normalizeResults(results, expectedCount) {
    // results should already be an array from _parseJSON
    // But handle edge cases just in case
    let arr;
    if (Array.isArray(results)) {
      arr = results;
    } else if (results && typeof results === 'object') {
      // Fallback: unwrap common wrapper keys
      const possibleArray = results.images || results.results || results.data || results.items;
      arr = Array.isArray(possibleArray) ? possibleArray : [results];
    } else {
      arr = [];
    }

    const normalized = arr.map(item => {
      if (!item) return null; // Preserve nulls
      return {
        tags: Array.isArray(item?.tags) ? item.tags.filter(t => typeof t === 'string' && t.trim()) : [],
        comment: typeof item?.comment === 'string' ? item.comment.trim() : (typeof item?.description === 'string' ? item.description.trim() : ''),
        title: typeof item?.title === 'string' ? item.title.trim() : '',
        subject: typeof item?.subject === 'string' ? item.subject.trim() : ''
      };
    });

    // BUG FIX #4: If AI returned fewer items than expected, pad with empty slots
    // This prevents images 2, 3, 4 from getting no data at all
    while (normalized.length < expectedCount) {
      console.warn(`[AI] Padding: got ${normalized.length} results, expected ${expectedCount}`);
      normalized.push(null);
    }

    return normalized.slice(0, expectedCount);
  },

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};
