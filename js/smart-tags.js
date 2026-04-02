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

  // Related terms thesaurus — maps keywords to related SEO terms
  THESAURUS: {
    // Technology
    'ai': ['artificial intelligence', 'machine learning', 'deep learning', 'AI technology', 'AI solutions'],
    'software': ['software development', 'phần mềm', 'ứng dụng', 'application', 'tech solutions'],
    'development': ['phát triển', 'xây dựng', 'lập trình', 'coding', 'programming'],
    'web': ['website', 'web development', 'trang web', 'thiết kế web', 'web design'],
    'app': ['ứng dụng', 'mobile app', 'application', 'phần mềm di động'],
    'cloud': ['điện toán đám mây', 'cloud computing', 'cloud services', 'SaaS'],
    'data': ['dữ liệu', 'big data', 'data analytics', 'phân tích dữ liệu'],
    'blockchain': ['blockchain technology', 'công nghệ blockchain', 'crypto', 'Web3', 'decentralized'],
    'devops': ['DevOps', 'CI/CD', 'automation', 'infrastructure', 'deployment'],
    'enterprise': ['doanh nghiệp', 'enterprise solutions', 'giải pháp doanh nghiệp', 'B2B'],
    'custom': ['tùy chỉnh', 'custom-built', 'theo yêu cầu', 'bespoke', 'tailor-made'],
    'services': ['dịch vụ', 'service provider', 'giải pháp', 'solutions'],
    'digital': ['số hóa', 'digital transformation', 'chuyển đổi số', 'công nghệ số'],
    'mobile': ['di động', 'mobile development', 'ứng dụng di động', 'smartphone'],
    'api': ['API integration', 'tích hợp API', 'web services', 'RESTful'],
    'security': ['bảo mật', 'cybersecurity', 'an ninh mạng', 'data protection'],
    'design': ['thiết kế', 'UI/UX', 'graphic design', 'creative design'],
    'marketing': ['tiếp thị', 'digital marketing', 'SEO', 'online marketing'],
    'ecommerce': ['thương mại điện tử', 'bán hàng online', 'online store', 'cửa hàng trực tuyến'],

    // Carpet / Rug / Thảm
    'tham': ['thảm', 'thảm trải sàn', 'carpet', 'rug', 'thảm trang trí'],
    'sofa': ['sofa', 'ghế sofa', 'bàn ghế sofa', 'nội thất phòng khách', 'couch'],
    'phong': ['phòng', 'không gian', 'nội thất', 'room'],
    'khach': ['khách', 'phòng khách', 'living room', 'tiếp khách'],
    'dep': ['đẹp', 'sang trọng', 'cao cấp', 'tinh tế', 'beautiful', 'elegant'],
    'cao': ['cao cấp', 'premium', 'luxury', 'chất lượng cao', 'high-end'],
    'cap': ['cấp', 'cao cấp', 'premium', 'hạng sang'],
    'long': ['lông', 'thảm lông', 'thảm lông xù', 'fluffy', 'shaggy'],
    'go': ['gỗ', 'ghế gỗ', 'sàn gỗ', 'nội thất gỗ', 'wooden'],
    'lot': ['lót', 'thảm lót', 'trải lót', 'padding', 'underlay'],
    'trai': ['trải', 'thảm trải', 'cover', 'spread'],
    'san': ['sàn', 'sàn nhà', 'floor', 'flooring'],
    'tron': ['tròn', 'hình tròn', 'circular', 'round'],
    'vintage': ['vintage', 'cổ điển', 'retro', 'classic style', 'phong cách cổ điển'],
    'trang': ['trang trí', 'decor', 'decoration', 'nội thất'],
    'tri': ['trí', 'trang trí', 'decorative'],
    'mau': ['màu', 'màu sắc', 'color', 'phối màu', 'color scheme'],
    'phoi': ['phối', 'phối màu', 'kết hợp', 'mix and match'],

    // PPF / Automotive
    'ppf': ['paint protection film', 'phim bảo vệ sơn', 'PPF ô tô', 'film bảo vệ'],
    'oto': ['ô tô', 'xe hơi', 'car', 'automotive', 'vehicle'],
    'xe': ['xe hơi', 'ô tô', 'automobile', 'car'],
    'bao': ['bảo vệ', 'protection', 'bảo dưỡng'],
    've': ['vệ', 'bảo vệ', 'vệ sinh'],

    // Location
    'tphcm': ['TP.HCM', 'Hồ Chí Minh', 'Sài Gòn', 'Ho Chi Minh City', 'HCMC'],
    'hanoi': ['Hà Nội', 'Ha Noi', 'thủ đô', 'Hanoi'],
    'vietnam': ['Việt Nam', 'Vietnam', 'VN'],
    'saigon': ['Sài Gòn', 'TP.HCM', 'Ho Chi Minh City'],

    // Business
    'gia': ['giá', 'báo giá', 'bảng giá', 'price', 'pricing', 'cost'],
    'mua': ['mua', 'mua hàng', 'đặt hàng', 'purchase', 'buy'],
    'ban': ['bán', 'bán hàng', 'cung cấp', 'sell', 'distributor'],
    'cung': ['cung cấp', 'nhà cung cấp', 'supplier', 'provider'],
    'huong': ['hướng', 'hướng dẫn', 'guide', 'tutorial', 'how-to'],
    'dan': ['dẫn', 'hướng dẫn', 'instruction', 'guideline'],
    'dich': ['dịch', 'dịch vụ', 'service'],
    'vu': ['vụ', 'dịch vụ', 'service'],
  },

  /**
   * Generate smart SEO tags and comment from filename
   * @param {string} filename - Image filename
   * @returns {{tags: string[], comment: string}}
   */
  generate(filename) {
    const parsed = FilenameParser.parse(filename);
    const words = parsed.tags || []; // cleaned lowercase keywords
    const title = parsed.title;

    // 1. Generate word combinations
    const combinations = this._generateCombinations(words);

    // 2. Expand with thesaurus
    const expanded = this._expandWithThesaurus(words);

    // 3. Merge all: original words + combinations + expanded
    const allTags = [...new Set([
      ...words,
      ...combinations,
      ...expanded
    ])].filter(t => t.length > 1);

    // 4. Generate natural comment
    const comment = this._generateComment(title, words, expanded);

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
   * Expand keywords using thesaurus
   */
  _expandWithThesaurus(words) {
    const expanded = [];

    words.forEach(word => {
      const key = word.toLowerCase();
      if (this.THESAURUS[key]) {
        // Add related terms (max 3 per word to avoid bloat)
        expanded.push(...this.THESAURUS[key].slice(0, 3));
      }
    });

    return expanded;
  },

  /**
   * Generate a natural meta description (~160 chars) from filename
   * Auto-detects language: English filename → English desc, Vietnamese → Vietnamese
   */
  _generateComment(title, words, expandedTerms) {
    const isVi = this._isVietnamese(title, words);
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
  processAll(images) {
    let count = 0;

    images.forEach(img => {
      const result = this.generate(img.filename);
      const parsed = FilenameParser.parse(img.filename);

      // Tags: merge filename tags + smart generated tags
      const filenameTagsArr = parsed.tags || [];
      const mergedTags = [...new Set([
        ...filenameTagsArr,
        ...result.tags
      ])];
      img.metadata.tags = mergedTags.join('; ');

      // Comment: use generated comment
      if (result.comment) {
        img.metadata.comment = result.comment;
      }

      img.aiProcessed = true;
      count++;
    });

    return count;
  }
};
