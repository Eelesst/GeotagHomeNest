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
            max_tokens: 4096
            // NOTE: Do NOT set response_format: json_object here.
            // json_object forces a single object return, breaking multi-image array responses.
            // We parse the JSON manually from the text response instead.
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

      // BUG FIX #1: Title & Subject — AI only FILLS if empty, never overrides user/filename values
      // Reason: title and subject are set from filename by default; AI should not change them
      if (result.title && !img.metadata.title) {
        img.metadata.title = result.title;
      }

      if (result.subject && !img.metadata.subject) {
        img.metadata.subject = result.subject;
      }

      // Comment: AI ALWAYS overrides when it returns a non-empty comment.
      // mergeResults() runs BEFORE SmartTagGenerator, so SmartTagGenerator will only
      // fill images where AI returned nothing. This ensures ALL images get proper AI comments.
      if (result.comment) {
        img.metadata.comment = result.comment;
      }

      // Mark as AI-processed so SmartTagGenerator skips comment for this image
      img.aiProcessed = true;
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

    const normalized = arr.map(item => ({
      tags: Array.isArray(item?.tags) ? item.tags.filter(t => typeof t === 'string' && t.trim()) : [],
      comment: typeof item?.comment === 'string' ? item.comment.trim() : '',
      title: typeof item?.title === 'string' ? item.title.trim() : '',
      subject: typeof item?.subject === 'string' ? item.subject.trim() : ''
    }));

    // BUG FIX #4: If AI returned fewer items than expected, pad with empty slots
    // This prevents images 2, 3, 4 from getting no data at all
    while (normalized.length < expectedCount) {
      console.warn(`[AI] Padding: got ${normalized.length} results, expected ${expectedCount}`);
      normalized.push({ tags: [], comment: '', title: '', subject: '' });
    }

    return normalized.slice(0, expectedCount);
  },

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};
