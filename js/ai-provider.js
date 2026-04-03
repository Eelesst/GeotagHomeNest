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

    const langInstruction = language === 'vi' 
      ? 'Vietnamese (tiếng Việt)' 
      : language === 'en' 
        ? 'English' 
        : 'Both Vietnamese AND English (mix naturally)';

    const imageList = images.map((img, i) => {
      const parsed = FilenameParser.parse(img.filename);
      return `${i + 1}. "${parsed.title}"${img.metadata.tags ? ` [existing tags: ${img.metadata.tags.substring(0, 80)}...]` : ''}`;
    }).join('\n');

    // Build context section only if user provided info
    let contextSection = '';
    if (industry || description || brand || mainKeywords) {
      contextSection = `\n## Business Context`;
      if (brand) contextSection += `\n- Brand: ${brand}`;
      if (industry) contextSection += `\n- Industry: ${industry}`;
      if (description) contextSection += `\n- Description: ${description}`;
      if (mainKeywords) contextSection += `\n- Main keywords: ${mainKeywords}`;
      contextSection += '\n';
    }

    return `You are an SEO metadata specialist.
${contextSection}
## Task
Generate SEO-optimized metadata for ${images.length} image(s) with these topics:
${imageList}

## For EACH image, generate:
1. **tags** (15-20 keywords): main keywords, long-tail variations, industry terms${brand ? `, include "${brand}"` : ''}, location keywords if applicable
2. **comment** (120-160 chars): natural meta description with primary keyword near start
3. **title** (50-70 chars): clear SEO title with primary keyword
4. **subject** (30-50 chars): brief topic summary

Language for all fields: ${langInstruction}

## Output
Return ONLY a valid JSON array with exactly ${images.length} items:
[{"tags":["keyword1","keyword2"],"comment":"Description","title":"SEO Title","subject":"Topic"}]

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no extra text.`;
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
   * Call Gemini API
   * @param {string} prompt - Text prompt
   * @param {string} apiKey - Gemini API key
   * @param {Array<string>} imageThumbnails - Optional base64 thumbnails for Vision
   * @returns {Promise<Object>} API response data
   */
  async callGemini(prompt, apiKey, imageThumbnails = []) {
    const models = this.providers.gemini.models;
    let lastError = null;

    for (const model of models) {
      try {
        console.log(`[AI] Gemini: trying ${model}...`);

        // Build parts: text + optional images
        const parts = [{ text: prompt }];
        for (const thumb of imageThumbnails) {
          if (thumb) {
            const base64 = thumb.split(',')[1];
            if (base64) {
              parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
            }
          }
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          const msg = err.error?.message || `API Error: ${response.status}`;
          if (response.status === 429 || msg.includes('quota') || msg.includes('rate') || msg.includes('exhausted')) {
            console.warn(`[AI] Gemini ${model}: quota exceeded`);
            lastError = new Error(`Gemini quota exceeded`);
            await this._sleep(2000);
            continue;
          }
          if (msg.includes('not found') || msg.includes('not supported')) {
            lastError = new Error(`${model}: not available`);
            continue;
          }
          throw new Error(msg);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty response');

        console.log(`[AI] ✅ Gemini ${model} success`);
        return this._parseJSON(text);

      } catch (err) {
        if (err.message?.includes('quota') || err.message?.includes('not available')) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('All Gemini models failed');
  },

  /**
   * Call OpenRouter API
   * @param {string} prompt - Text prompt
   * @param {string} apiKey - OpenRouter API key
   * @param {Array<string>} imageThumbnails - Optional thumbnails for Vision
   * @returns {Promise<Object>} Parsed JSON response
   */
  async callOpenRouter(prompt, apiKey, imageThumbnails = []) {
    const models = this.providers.openrouter.models;
    let lastError = null;

    for (const model of models) {
      try {
        console.log(`[AI] OpenRouter: trying ${model}...`);

        // Build message content
        const content = [{ type: 'text', text: prompt }];
        for (const thumb of imageThumbnails) {
          if (thumb) {
            content.push({ type: 'image_url', image_url: { url: thumb } });
          }
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href,
            'X-Title': 'Image GeoTag Tool'
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content }],
            temperature: 0.7,
            max_tokens: 4096,
            response_format: { type: 'json_object' }
          })
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          const msg = err.error?.message || `API Error: ${response.status}`;
          if (response.status === 429) {
            console.warn(`[AI] OpenRouter ${model}: rate limited`);
            lastError = new Error('OpenRouter rate limited');
            await this._sleep(3000);
            continue;
          }
          if (response.status === 402) {
            console.warn(`[AI] OpenRouter ${model}: needs credits, trying free model...`);
            lastError = new Error('OpenRouter needs credits');
            continue;
          }
          if (response.status === 404 || msg.includes('not found') || msg.includes('No endpoints')) {
            console.warn(`[AI] OpenRouter ${model}: not available`);
            lastError = new Error(`${model}: not available`);
            continue;
          }
          throw new Error(msg);
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (!text) throw new Error('Empty response');

        console.log(`[AI] ✅ OpenRouter ${model} success`);
        return this._parseJSON(text);

      } catch (err) {
        if (err.message?.includes('rate limit') || err.message?.includes('not available') || err.message?.includes('needs credits')) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('All OpenRouter models failed');
  },

  /**
   * Main entry point: process images with AI using fallback chain
   * Gemini → OpenRouter → Offline
   * 
   * @param {Array} images - Image objects from app state
   * @param {Object} config - { provider, geminiKey, openrouterKey, projectContext }
   * @param {Function} onProgress - Progress callback (percentage, message)
   * @returns {Promise<{results: Array, provider: string}>}
   */
  async processImages(images, config, onProgress) {
    const { provider, geminiKey, openrouterKey, projectContext } = config;
    const batchSize = 5;
    const allResults = [];
    let usedProvider = 'offline';

    // Prepare thumbnails if vision mode
    let thumbnails = [];
    if (projectContext.visionMode && images.length <= 10) {
      onProgress(5, 'Đang tạo thumbnails cho Vision AI...');
      for (const img of images) {
        const thumb = await this.createThumbnail(img.dataURL, 256);
        thumbnails.push(thumb);
      }
      console.log(`[AI] Created ${thumbnails.length} thumbnails for Vision`);
    }

    // Split into batches
    const batches = [];
    for (let i = 0; i < images.length; i += batchSize) {
      batches.push({
        images: images.slice(i, i + batchSize),
        thumbnails: thumbnails.slice(i, i + batchSize),
        startIdx: i
      });
    }

    let processed = 0;
    let currentProvider = provider; // 'gemini', 'openrouter', or 'auto'

    for (const batch of batches) {
      const prompt = this.buildPrompt(batch.images, projectContext);
      let batchResults = null;

      // Try providers in order
      const tryOrder = this._getProviderOrder(currentProvider, geminiKey, openrouterKey);

      for (const tryProvider of tryOrder) {
        try {
          if (tryProvider === 'gemini' && geminiKey) {
            batchResults = await this.callGemini(
              prompt, geminiKey,
              projectContext.visionMode ? batch.thumbnails : []
            );
            usedProvider = 'Gemini';
            break;
          }
          if (tryProvider === 'openrouter' && openrouterKey) {
            batchResults = await this.callOpenRouter(
              prompt, openrouterKey,
              projectContext.visionMode ? batch.thumbnails : []
            );
            usedProvider = 'OpenRouter';
            break;
          }
        } catch (err) {
          console.warn(`[AI] ${tryProvider} failed for batch:`, err.message);
          continue;
        }
      }

      // Fallback to offline for this batch
      if (!batchResults) {
        console.log('[AI] Using offline SmartTagGenerator for batch');
        usedProvider = 'Offline';
        batchResults = batch.images.map(img => {
          const parsed = FilenameParser.parse(img.filename);
          return {
            tags: parsed.tags || [],
            comment: '',
            title: parsed.title || '',
            subject: ''
          };
        });
      }

      // Normalize results
      const normalized = this._normalizeResults(batchResults, batch.images.length);
      allResults.push(...normalized);

      processed += batch.images.length;
      const pct = Math.round((processed / images.length) * 90) + 10;
      onProgress(pct, `AI đang xử lý ${processed}/${images.length}... (${usedProvider})`);

      // Rate limiting between batches
      if (batches.indexOf(batch) < batches.length - 1) {
        await this._sleep(1500);
      }
    }

    return { results: allResults, provider: usedProvider };
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

      // Tags: ALWAYS merge (add AI tags to existing, no duplicates)
      if (result.tags && result.tags.length > 0) {
        const existing = (img.metadata.tags || '')
          .split(';').map(t => t.trim()).filter(Boolean);
        const existingLower = new Set(existing.map(t => t.toLowerCase()));
        const newTags = result.tags
          .map(t => t.trim())
          .filter(t => t && !existingLower.has(t.toLowerCase()));
        img.metadata.tags = [...existing, ...newTags].join('; ');
      }

      // Title: AI OVERRIDES filename-based title (AI generates better SEO title)
      if (result.title) {
        img.metadata.title = result.title;
      }

      // Subject: AI OVERRIDES filename-based subject
      if (result.subject) {
        img.metadata.subject = result.subject;
      }

      // Comment: AI OVERRIDES filename-based comment (AI meta description >> filename text)
      if (result.comment) {
        img.metadata.comment = result.comment;
      }
    });
  },

  // ==================== INTERNAL HELPERS ====================

  /**
   * Determine provider order based on config
   */
  _getProviderOrder(preferred, geminiKey, openrouterKey) {
    if (preferred === 'gemini') return ['gemini', 'openrouter'];
    if (preferred === 'openrouter') return ['openrouter', 'gemini'];
    // 'auto': try gemini first if key available, then openrouter
    const order = [];
    if (geminiKey) order.push('gemini');
    if (openrouterKey) order.push('openrouter');
    return order.length > 0 ? order : ['gemini'];
  },

  /**
   * Parse JSON from LLM response (handles markdown fences, etc.)
   */
  _parseJSON(text) {
    try {
      const clean = text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      const parsed = JSON.parse(clean);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      console.warn('[AI] JSON parse failed, trying regex extraction');
      // Try to find JSON array in text
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          return JSON.parse(arrayMatch[0]);
        } catch (e2) { /* fall through */ }
      }
      // Try individual objects
      const results = [];
      const objRegex = /\{[^{}]*"tags"\s*:\s*\[[^\]]*\][^{}]*\}/g;
      let match;
      while ((match = objRegex.exec(text)) !== null) {
        try { results.push(JSON.parse(match[0])); } catch (e3) { /* skip */ }
      }
      if (results.length > 0) return results;
      throw new Error('Could not parse LLM response');
    }
  },

  /**
   * Normalize results to ensure correct structure
   */
  _normalizeResults(results, expectedCount) {
    const arr = Array.isArray(results) ? results : [results];
    const normalized = arr.map(item => ({
      tags: Array.isArray(item?.tags) ? item.tags.filter(t => typeof t === 'string') : [],
      comment: typeof item?.comment === 'string' ? item.comment : '',
      title: typeof item?.title === 'string' ? item.title : '',
      subject: typeof item?.subject === 'string' ? item.subject : ''
    }));

    // Pad with empty results if needed
    while (normalized.length < expectedCount) {
      normalized.push({ tags: [], comment: '', title: '', subject: '' });
    }

    return normalized.slice(0, expectedCount);
  },

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};
