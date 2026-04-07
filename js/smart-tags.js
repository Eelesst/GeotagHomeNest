/**
 * SmartTagGenerator - Generate SEO tags & descriptions from filename
 * 100% offline, no API needed
 * 
 * Strategy:
 * 1. Parse filename into keywords
 * 2. Generate word combinations (bigrams, trigrams)
 * 3. Expand with related/synonym terms from built-in thesaurus
 * 4. Create natural language comment
 */
const SmartTagGenerator = {

  // Related terms thesaurus — maps keywords to related SEO terms (LANGUAGE SEPARATED)
  THESAURUS: {
    // Technology
    'ai': {
      vi: ['trí tuệ nhân tạo', 'học máy', 'công nghệ AI', 'giải pháp AI'],
      en: ['artificial intelligence', 'machine learning', 'deep learning', 'AI technology', 'AI solutions']
    },
    'software': {
      vi: ['phần mềm', 'ứng dụng', 'giải pháp phần mềm'],
      en: ['software development', 'application', 'tech solutions', 'software product']
    },
    'development': {
      vi: ['phát triển', 'xây dựng', 'lập trình'],
      en: ['coding', 'programming', 'software engineering']
    },
    'web': {
      vi: ['trang web', 'thiết kế web', 'phát triển web'],
      en: ['website', 'web development', 'web design']
    },
    'app': {
      vi: ['ứng dụng', 'phần mềm di động'],
      en: ['mobile app', 'application', 'mobile software']
    },
    'cloud': {
      vi: ['điện toán đám mây', 'dịch vụ đám mây'],
      en: ['cloud computing', 'cloud services', 'SaaS']
    },
    'data': {
      vi: ['dữ liệu', 'phân tích dữ liệu'],
      en: ['big data', 'data analytics', 'data-driven']
    },
    'blockchain': {
      vi: ['công nghệ blockchain', 'tiền điện tử'],
      en: ['blockchain technology', 'crypto', 'Web3', 'decentralized']
    },
    'devops': {
      vi: ['tự động hóa', 'hạ tầng công nghệ'],
      en: ['DevOps', 'CI/CD', 'automation', 'infrastructure']
    },
    'enterprise': {
      vi: ['doanh nghiệp', 'giải pháp doanh nghiệp'],
      en: ['enterprise solutions', 'B2B', 'corporate software']
    },
    'custom': {
      vi: ['tùy chỉnh', 'theo yêu cầu'],
      en: ['custom-built', 'bespoke', 'tailor-made']
    },
    'services': {
      vi: ['dịch vụ', 'giải pháp'],
      en: ['service provider', 'professional services']
    },
    'digital': {
      vi: ['số hóa', 'chuyển đổi số', 'công nghệ số'],
      en: ['digital transformation', 'digitalization']
    },
    'mobile': {
      vi: ['di động', 'ứng dụng di động'],
      en: ['mobile development', 'smartphone app']
    },
    'api': {
      vi: ['tích hợp API', 'kết nối hệ thống'],
      en: ['API integration', 'web services', 'RESTful']
    },
    'security': {
      vi: ['bảo mật', 'an ninh mạng', 'bảo vệ dữ liệu'],
      en: ['cybersecurity', 'data protection', 'network security']
    },
    'design': {
      vi: ['thiết kế', 'giao diện người dùng'],
      en: ['UI/UX', 'graphic design', 'creative design']
    },
    'marketing': {
      vi: ['tiếp thị', 'marketing số'],
      en: ['digital marketing', 'SEO', 'online marketing']
    },
    'ecommerce': {
      vi: ['thương mại điện tử', 'bán hàng online'],
      en: ['online store', 'e-commerce platform']
    },

    // Carpet / Rug / Thảm
    'tham': {
      vi: ['thảm', 'thảm trải sàn', 'thảm trang trí', 'thảm phòng khách'],
      en: ['carpet', 'rug', 'floor mat']
    },
    'sofa': {
      vi: ['ghế sofa', 'nội thất phòng khách', 'sofa phòng khách'],
      en: ['sofa', 'couch', 'living room furniture']
    },
    'phong': {
      vi: ['phòng', 'không gian', 'nội thất'],
      en: ['room', 'interior space']
    },
    'khach': {
      vi: ['khách', 'phòng khách', 'tiếp khách'],
      en: ['living room', 'guest room']
    },
    'dep': {
      vi: ['đẹp', 'sang trọng', 'tinh tế'],
      en: ['beautiful', 'elegant', 'stylish']
    },
    'cao': {
      vi: ['cao cấp', 'chất lượng cao', 'hạng sang'],
      en: ['premium', 'high-end', 'luxury']
    },
    'long': {
      vi: ['lông', 'thảm lông', 'thảm lông xù'],
      en: ['fluffy', 'shaggy', 'furry rug']
    },
    'go': {
      vi: ['gỗ', 'nội thất gỗ', 'sàn gỗ'],
      en: ['wood', 'wooden furniture', 'hardwood']
    },
    'lot': {
      vi: ['lót', 'thảm lót'],
      en: ['padding', 'underlay', 'floor padding']
    },
    'trai': {
      vi: ['trải', 'thảm trải'],
      en: ['floor cover', 'spread']
    },
    'san': {
      vi: ['sàn', 'sàn nhà'],
      en: ['floor', 'flooring']
    },
    'tron': {
      vi: ['tròn', 'hình tròn'],
      en: ['circular', 'round', 'round rug']
    },
    'vintage': {
      vi: ['cổ điển', 'phong cách cổ điển'],
      en: ['vintage', 'retro', 'classic style']
    },
    'trang': {
      vi: ['trang trí', 'trang trí nội thất'],
      en: ['decor', 'decoration']
    },
    'mau': {
      vi: ['màu', 'màu sắc', 'phối màu'],
      en: ['color', 'color scheme', 'colorful']
    },
    'phoi': {
      vi: ['phối', 'phối màu', 'kết hợp'],
      en: ['color mix', 'combination']
    },

    // PPF / Automotive
    'ppf': {
      vi: ['phim bảo vệ sơn', 'PPF ô tô', 'film bảo vệ xe'],
      en: ['paint protection film', 'PPF', 'clear bra']
    },
    'oto': {
      vi: ['ô tô', 'xe hơi', 'xe ô tô'],
      en: ['car', 'automotive', 'vehicle']
    },
    'xe': {
      vi: ['xe hơi', 'ô tô'],
      en: ['automobile', 'car']
    },
    'bao': {
      vi: ['bảo vệ', 'bảo dưỡng'],
      en: ['protection', 'maintenance']
    },

    // Location
    'tphcm': {
      vi: ['TP.HCM', 'Hồ Chí Minh', 'Sài Gòn', 'thành phố Hồ Chí Minh'],
      en: ['Ho Chi Minh City', 'HCMC', 'Saigon']
    },
    'hanoi': {
      vi: ['Hà Nội', 'thủ đô'],
      en: ['Hanoi', 'Ha Noi', 'Vietnam capital']
    },
    'vietnam': {
      vi: ['Việt Nam', 'VN'],
      en: ['Vietnam', 'Vietnamese']
    },
    'saigon': {
      vi: ['Sài Gòn', 'TP.HCM'],
      en: ['Saigon', 'Ho Chi Minh City']
    },

    // Business
    'gia': {
      vi: ['giá', 'báo giá', 'bảng giá'],
      en: ['price', 'pricing', 'cost']
    },
    'mua': {
      vi: ['mua', 'mua hàng', 'đặt hàng'],
      en: ['purchase', 'buy', 'order']
    },
    'ban': {
      vi: ['bán', 'bán hàng', 'cung cấp'],
      en: ['sell', 'distributor', 'supplier']
    },
    'cung': {
      vi: ['cung cấp', 'nhà cung cấp'],
      en: ['supplier', 'provider']
    },
    'huong': {
      vi: ['hướng', 'hướng dẫn'],
      en: ['guide', 'tutorial']
    },
    'dich': {
      vi: ['dịch', 'dịch vụ'],
      en: ['service']
    },
    'vu': {
      vi: ['vụ', 'dịch vụ'],
      en: ['service']
    },
  },

  /**
   * Generate smart SEO tags and comment from filename
   * @param {string} filename - Image filename
   * @returns {{tags: string[], comment: string}}
   */
  generate(filename, options = {}) {
    const parsed = FilenameParser.parse(filename);
    const words = parsed.tags || []; // cleaned lowercase keywords
    const title = parsed.title;
    const language = options.language || 'both'; // 'vi', 'en', 'both'
    const brandName = options.brand || ''; // brand name to protect from splitting

    // 1. Generate word combinations
    const combinations = this._generateCombinations(words);

    // 2. Expand with thesaurus (language-aware)
    const expanded = this._expandWithThesaurus(words, language);

    // 3. Merge all: original words + combinations + expanded
    const allTags = [...new Set([
      ...words,
      ...combinations,
      ...expanded
    ])].filter(t => t.length > 1);

    // 4. Add brand as protected unified tag if provided
    if (brandName && brandName.length > 1) {
      const brandLower = brandName.toLowerCase();
      if (!allTags.some(t => t.toLowerCase() === brandLower)) {
        allTags.unshift(brandName); // Add brand as first tag
      }
    }

    // 5. Generate natural comment
    const comment = this._generateComment(title, words, expanded, language);

    return { tags: allTags, comment };
  },

  /**
   * Generate bigrams and trigrams from words
   * e.g., ["ai", "development", "services"] → ["ai development", "development services", "ai development services"]
   */
  _generateCombinations(words) {
    const combos = [];

    // Bigrams
    for (let i = 0; i < words.length - 1; i++) {
      combos.push(`${words[i]} ${words[i + 1]}`);
    }

    // Trigrams
    for (let i = 0; i < words.length - 2; i++) {
      combos.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }

    // Full phrase (if 2-5 words)
    if (words.length >= 2 && words.length <= 5) {
      combos.push(words.join(' '));
    }

    return combos;
  },

  /**
   * Expand keywords using thesaurus (language-aware)
   * @param {string[]} words - Keywords
   * @param {string} language - 'vi', 'en', or 'both'
   */
  _expandWithThesaurus(words, language = 'both') {
    const expanded = [];

    words.forEach(word => {
      const key = word.toLowerCase();
      const entry = this.THESAURUS[key];
      if (!entry) return;

      // New format: { vi: [...], en: [...] }
      if (typeof entry === 'object' && !Array.isArray(entry)) {
        if (language === 'vi' || language === 'both') {
          expanded.push(...(entry.vi || []).slice(0, 3));
        }
        if (language === 'en' || language === 'both') {
          expanded.push(...(entry.en || []).slice(0, 3));
        }
      } else if (Array.isArray(entry)) {
        // Legacy format fallback
        expanded.push(...entry.slice(0, 3));
      }
    });

    return expanded;
  },

  /**
   * Generate a natural meta description (~160 chars) from filename
   * Auto-detects language: English filename → English desc, Vietnamese → Vietnamese
   */
  _generateComment(title, words, expandedTerms, language = 'both') {
    const isVi = language === 'vi' || (language === 'both' && this._isVietnamese(title, words));
    const domain = this._detectDomain(words);

    // Build description based on domain + language
    const templates = this._getTemplates(domain, isVi);
    const hash = words.join('').length % templates.length;
    
    return templates[hash](title);
  },

  /**
   * Detect if filename is Vietnamese
   * Checks for Vietnamese diacritics or known Vietnamese keywords
   */
  _isVietnamese(title, words) {
    // Check for Vietnamese Unicode characters (diacritics)
    const viRegex = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i;
    if (viRegex.test(title)) return true;

    // Check for common Vietnamese romanized words (no diacritics)
    const viKeywords = ['tham', 'sofa', 'phong', 'khach', 'dep', 'cao', 'cap', 'long', 'lot', 'trai', 'san', 'tron', 'mau', 'phoi', 'trang', 'tri', 'gia', 'mua', 'ban', 'cung', 'dich', 'vu', 'huong', 'dan', 'bao', 've', 'oto', 'xe', 'ppf', 'tphcm', 'hanoi', 'saigon', 'noi', 'that', 'ghe', 'ban'];
    const wordSet = new Set(words.map(w => w.toLowerCase()));
    const viMatchCount = viKeywords.filter(k => wordSet.has(k)).length;

    return viMatchCount >= 2;
  },

  /**
   * Detect which domain/industry the keywords belong to
   */
  _detectDomain(words) {
    const wordSet = new Set(words.map(w => w.toLowerCase()));
    
    const techWords = ['ai', 'software', 'development', 'web', 'app', 'cloud', 'data', 'blockchain', 'devops', 'api', 'digital', 'mobile', 'security', 'code', 'programming', 'technology', 'tech', 'developer', 'system', 'platform', 'saas', 'enterprise', 'custom'];
    const carpetWords = ['tham', 'sofa', 'carpet', 'rug', 'trai', 'lot', 'long', 'san', 'phong', 'khach', 'go', 'tron', 'vintage', 'trang', 'noi', 'that', 'dep', 'mau', 'phoi'];
    const autoWords = ['ppf', 'oto', 'xe', 'car', 'automotive', 'film', 'son', 'paint', 'wrap', 'ceramic', 'coating', 'bao', 'vehicle'];
    const bizWords = ['gia', 'mua', 'ban', 'cung', 'dich', 'vu', 'huong', 'dan', 'marketing', 'ecommerce', 'agency', 'company', 'brand'];

    const score = (list) => list.filter(w => wordSet.has(w)).length;
    const scores = { tech: score(techWords), carpet: score(carpetWords), automotive: score(autoWords), business: score(bizWords) };
    const max = Math.max(...Object.values(scores));
    if (max === 0) return 'general';
    return Object.entries(scores).find(([, v]) => v === max)[0];
  },

  /**
   * Get templates array for domain + language
   * Each template is a function(title) => string (max ~160 chars)
   */
  _getTemplates(domain, isVi) {
    const t = {
      tech: {
        vi: [
          (title) => `${title} - giải pháp công nghệ hiện đại giúp doanh nghiệp tối ưu hóa quy trình và nâng cao hiệu suất hoạt động`,
          (title) => `${title} - dịch vụ công nghệ chuyên nghiệp, đáp ứng nhu cầu chuyển đổi số cho mọi quy mô doanh nghiệp`,
          (title) => `${title} với giải pháp tiên tiến, được thiết kế mang lại hiệu quả tối đa và trải nghiệm vượt trội`
        ],
        en: [
          (title) => `${title} - modern technology solutions that help businesses optimize workflows and enhance performance`,
          (title) => `${title} - professional tech services designed to drive digital transformation and business growth`,
          (title) => `Explore ${title} with cutting-edge solutions built for maximum efficiency and exceptional user experience`
        ]
      },
      carpet: {
        vi: [
          (title) => `${title} - sản phẩm chất lượng cao với đa dạng mẫu mã, phù hợp cho mọi không gian nội thất hiện đại`,
          (title) => `${title} sang trọng, thiết kế tinh tế giúp nâng tầm thẩm mỹ và sự thoải mái cho không gian sống`,
          (title) => `${title} chất liệu bền đẹp, dễ vệ sinh, lựa chọn hoàn hảo cho phòng khách và không gian làm việc`
        ],
        en: [
          (title) => `${title} - premium quality products with diverse designs, perfect for every modern interior space`,
          (title) => `${title} featuring elegant craftsmanship that elevates comfort and aesthetics in your living space`,
          (title) => `${title} with durable and easy-to-clean materials, ideal for living rooms and workspaces`
        ]
      },
      automotive: {
        vi: [
          (title) => `${title} - giải pháp bảo vệ xe hơi chuyên nghiệp, giữ gìn vẻ đẹp và tăng giá trị xe theo thời gian`,
          (title) => `${title} chất lượng cao, dịch vụ chăm sóc và bảo vệ xe ô tô đẳng cấp, uy tín hàng đầu`,
          (title) => `${title} - công nghệ tiên tiến bảo vệ bề mặt sơn xe, chống trầy xước và tác động môi trường`
        ],
        en: [
          (title) => `${title} - professional car protection solutions that preserve your vehicle's beauty and value over time`,
          (title) => `${title} high-quality automotive care and protection services, trusted by car enthusiasts worldwide`,
          (title) => `${title} - advanced technology for paint surface protection against scratches and environmental damage`
        ]
      },
      business: {
        vi: [
          (title) => `${title} - thông tin chi tiết giúp khách hàng đưa ra quyết định chính xác và hiệu quả nhất`,
          (title) => `${title} cung cấp góc nhìn trực quan về sản phẩm và dịch vụ chất lượng, đáng tin cậy`,
          (title) => `${title} với nội dung hữu ích, hướng dẫn chi tiết và lời khuyên từ chuyên gia trong ngành`
        ],
        en: [
          (title) => `${title} - detailed insights to help customers make informed and effective decisions`,
          (title) => `${title} providing a visual perspective on quality products and trusted services`,
          (title) => `${title} with practical guides, step-by-step instructions, and expert industry advice`
        ]
      },
      general: {
        vi: [
          (title) => `${title} - hình ảnh chất lượng cao, nội dung trực quan và chi tiết phục vụ nhu cầu tham khảo`,
          (title) => `${title} - hình ảnh chuyên nghiệp, thể hiện rõ nét nội dung và giá trị sản phẩm mang lại`,
          (title) => `${title} qua hình ảnh sắc nét, giúp hiểu rõ hơn về chủ đề này một cách trực quan và sinh động`
        ],
        en: [
          (title) => `${title} - high-quality image with detailed visual content for reference and exploration`,
          (title) => `${title} - professional illustration clearly representing the content and product value`,
          (title) => `${title} captured in sharp detail, helping you understand this topic visually and vividly`
        ]
      }
    };

    const lang = isVi ? 'vi' : 'en';
    return (t[domain] && t[domain][lang]) || t.general[lang];
  },

  /**
   * Process all images — batch operation, no API needed
   * @param {Array} images - Array of image objects with .filename and .metadata
   * @returns {number} Number of images processed
   */
  processAll(images, options = {}) {
    const language = options.language || 'both';
    const brandName = options.brand || '';
    let count = 0;

    images.forEach(img => {
      const result = this.generate(img.filename, { language, brand: brandName });
      const parsed = FilenameParser.parse(img.filename);

      // Tags: only fill if currently empty; otherwise merge new tags into existing
      const existingTagsStr = (img.metadata.tags || '').trim();
      if (!existingTagsStr) {
        // No existing tags — generate from scratch
        const filenameTagsArr = parsed.tags || [];
        const mergedTags = [...new Set([
          ...filenameTagsArr,
          ...result.tags
        ])];
        img.metadata.tags = mergedTags.join('; ');
      } else {
        // Has existing tags — merge new tags without duplicates
        const existingTags = existingTagsStr.split(';').map(t => t.trim()).filter(Boolean);
        const existingLower = new Set(existingTags.map(t => t.toLowerCase()));
        const newTags = result.tags.filter(t => !existingLower.has(t.toLowerCase()));
        if (newTags.length > 0) {
          img.metadata.tags = [...existingTags, ...newTags].join('; ');
        }
      }

      // Comment: only fill if currently empty AND not yet AI-processed
      // If img.aiProcessed = true, the AI already wrote the comment (even if it was empty from AI,
      // we trust the offline template only when AI was never used for this image)
      if (!img.aiProcessed && result.comment) {
        // If it's completely empty OR if it matches the default auto-parsed string from filename
        if (!img.metadata.comment || img.metadata.comment === parsed.comment) {
          img.metadata.comment = result.comment;
        }
      }

      // BUG FIX #1: Title & Subject — offline mode only fills if empty (never override)
      if (!img.metadata.title && parsed.title) {
        img.metadata.title = parsed.title;
      }

      if (!img.metadata.subject && parsed.subject) {
        img.metadata.subject = parsed.subject;
      }

      count++;
    });

    return count;
  },

  /**
   * Add website info to AUTHOR and COPYRIGHT fields only — NOT to tags.
   * BUG FIX #2: Website URL should go to author/copyright metadata, not tag keywords.
   * @param {Array} images - Array of image objects
   * @param {string} websiteUrl - Full URL like "https://autolinkvietnam.com.vn"
   */
  addWebsiteToMetadata(images, websiteUrl) {
    if (!websiteUrl || !images || images.length === 0) return;

    // Extract clean domain from URL
    let domain = websiteUrl;
    try {
      if (!domain.startsWith('http')) {
        domain = 'https://' + domain;
      }
      const urlObj = new URL(domain);
      domain = urlObj.hostname;
    } catch (e) {
      domain = websiteUrl
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./, '')
        .trim();
    }

    if (!domain) return;

    const cleanDomain = domain.replace(/^www\./, '');
    const cleanUrl = websiteUrl.replace(/\/+$/, '');

    console.log(`[SmartTags] Adding website to author/copyright metadata: ${cleanDomain}`);

    // Apply to all images — only update author/copyright, NOT tags
    images.forEach(img => {
      // Append domain to copyright if not already there
      if (!img.metadata.copyright) {
        img.metadata.copyright = cleanUrl;
      } else if (!img.metadata.copyright.toLowerCase().includes(cleanDomain.toLowerCase())) {
        img.metadata.copyright = `${img.metadata.copyright} - ${cleanUrl}`;
      }

      // If author is empty, set it to the domain
      if (!img.metadata.author) {
        img.metadata.author = cleanDomain;
      }
    });
  },

  /**
   * @deprecated Use addWebsiteToMetadata instead
   * Legacy method kept for backward compatibility — now routes to addWebsiteToMetadata
   */
  addWebsiteTags(images, websiteUrl) {
    return this.addWebsiteToMetadata(images, websiteUrl);
  }
};
