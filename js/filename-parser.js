/**
 * FilenameParser - Parse image filename to auto-generate metadata
 * 
 * Example:
 *   Input:  "tham-sofa-phong-khach-dep-2025.jpg"
 *   Output: {
 *     title:   "Tham Sofa Phong Khach Dep 2025",
 *     subject: "Tham Sofa Phong Khach Dep",
 *     tags:    ["tham", "sofa", "phong", "khach", "dep"],
 *     comment: "Tham sofa phong khach dep 2025"
 *   }
 */
const FilenameParser = {
  // Vietnamese & English stopwords to exclude from tags
  STOPWORDS: new Set([
    // Vietnamese
    'va', 'cua', 'cho', 'trong', 'voi', 'tai', 'o', 'den', 'tu', 'la',
    'mot', 'cac', 'nhung', 'nay', 'do', 'khi', 'thi', 'ma', 'se', 'da',
    'hay', 'hon', 'nhat', 'duoc', 'theo', 'bang', 'qua', 'len', 'xuong',
    // English
    'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for',
    'is', 'it', 'by', 'with', 'from', 'as', 'be', 'was', 'are', 'has',
    'img', 'dsc', 'photo', 'image', 'pic', 'screenshot'
  ]),

  /**
   * Parse a filename into structured metadata
   * @param {string} filename - The image filename (with or without extension)
   * @returns {Object} { title, subject, tags, comment }
   */
  parse(filename) {
    // Step 1: Remove file extension
    const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

    // Step 2: Replace common separators with spaces
    let cleaned = nameWithoutExt
      .replace(/[-_]+/g, ' ')      // hyphens & underscores → spaces
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase → spaces
      .replace(/\s+/g, ' ')        // collapse multiple spaces
      .trim();

    // Step 3: Split into words
    const words = cleaned.split(' ').filter(w => w.length > 0);

    // Step 4: Generate Title (capitalize each word)
    const title = words
      .map(w => this._capitalize(w))
      .join(' ');

    // Step 5: Generate Subject (title without standalone numbers)
    const subjectWords = words.filter(w => !/^\d+$/.test(w));
    const subject = subjectWords
      .map(w => this._capitalize(w))
      .join(' ');

    // Step 6: Generate Tags (unique, meaningful words)
    const tags = words
      .map(w => w.toLowerCase())
      .filter(w => !this.STOPWORDS.has(w))
      .filter(w => w.length > 1)
      .filter(w => !/^\d+$/.test(w))
      .filter((w, i, arr) => arr.indexOf(w) === i); // unique

    // Step 7: Generate Comment (natural sentence format)
    const comment = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();

    return { title, subject, tags, comment };
  },

  /**
   * Capitalize first letter of a word
   * @private
   */
  _capitalize(word) {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  },

  /**
   * Generate a clean filename from metadata (for renaming)
   * @param {string} title - The title to convert
   * @param {string} ext - File extension (e.g., '.jpg')
   * @returns {string} Clean filename
   */
  toFilename(title, ext = '.jpg') {
    return title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') + ext;
  }
};
