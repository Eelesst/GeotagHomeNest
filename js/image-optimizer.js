/**
 * ImageOptimizer - Resize and compress images using Canvas API
 *
 * Runs entirely in the browser. Applied only during download,
 * so the original in-memory image is never modified.
 */
const ImageOptimizer = {

  /**
   * Resize and compress a JPEG data URL
   * @param {string} dataURL - input image data URL
   * @param {Object} options
   * @param {number} options.maxWidth  - max width in px (default 1920)
   * @param {number} options.quality  - JPEG quality 0–1 (default 0.85)
   * @returns {Promise<string>} optimized JPEG data URL
   */
  optimize(dataURL, options = {}) {
    const maxWidth = options.maxWidth || 1920;
    const quality = options.quality || 0.85;

    return new Promise((resolve) => {
      const img = new Image();

      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;

        if (w > maxWidth) {
          h = Math.round(h * (maxWidth / w));
          w = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };

      img.onerror = () => resolve(dataURL); // fallback: trả về ảnh gốc
      img.src = dataURL;
    });
  }
};
