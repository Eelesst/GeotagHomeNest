/**
 * Downloader - Package processed images into ZIP and trigger download
 * 
 * Uses JSZip for compression with a 3-tier download approach:
 * 1. File System Access API (showSaveFilePicker) — native Save As dialog
 * 2. Blob URL + anchor click — most reliable for file:// protocol
 * 3. Data URL fallback — last resort
 */
const Downloader = {

  /**
   * Reliable download with 3-tier fallback
   * @param {Blob} blob
   * @param {string} filename
   */
  async _download(blob, filename) {
    console.log(`[Downloader] Starting download: ${filename} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);

    // Method 1: File System Access API (native Save As dialog)
    if (window.showSaveFilePicker) {
      try {
        const ext = filename.endsWith('.zip') ? '.zip' : '.jpg';
        const mimeType = ext === '.zip' ? 'application/zip' : 'image/jpeg';
        const description = ext === '.zip' ? 'ZIP Archive' : 'JPEG Image';

        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: description,
            accept: { [mimeType]: [ext] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        console.log('[Downloader] ✅ Downloaded via showSaveFilePicker');
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          console.log('[Downloader] User cancelled save dialog');
          return;
        }
        console.warn('[Downloader] showSaveFilePicker failed, trying Blob URL fallback:', err.message);
      }
    }

    // Method 2: Blob URL + anchor tag (most reliable for file:// protocol)
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);

      // Use click event
      a.click();

      // Cleanup after a delay to ensure download starts
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('[Downloader] ✅ Downloaded via Blob URL, cleaned up');
      }, 5000);

      console.log('[Downloader] ✅ Triggered download via Blob URL');
      return;
    } catch (err) {
      console.warn('[Downloader] Blob URL method failed, trying Data URL fallback:', err.message);
    }

    // Method 3: Data URL fallback (uses more memory, may fail on large files)
    try {
      const reader = new FileReader();
      await new Promise((resolve, reject) => {
        reader.onloadend = function () {
          try {
            const a = document.createElement('a');
            a.href = reader.result;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => document.body.removeChild(a), 500);
            console.log('[Downloader] ✅ Downloaded via Data URL');
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error('[Downloader] ❌ All download methods failed:', err);
      throw new Error('Không thể tải file. Vui lòng thử mở tool bằng local HTTP server.');
    }
  },

  /**
   * Process all images: [optimize] → write metadata → package ZIP → download
   * @param {Array} images - Array of image objects from App.state.images
   * @param {Function} onProgress - Progress callback(percent: 0-100, message: string)
   * @param {Object|null} optimizeSettings - { maxWidth, quality } or null to skip
   * @returns {Promise<void>}
   */
  async downloadAll(images, onProgress, optimizeSettings = null) {
    if (!images || images.length === 0) {
      throw new Error('Không có ảnh nào để tải xuống');
    }

    console.log(`[Downloader] Processing ${images.length} images for ZIP...`);

    const zip = new JSZip();
    const folder = zip.folder('geotagged-images');
    const total = images.length;
    let processed = 0;
    let errors = 0;

    onProgress(0, `Đang xử lý 0/${total} ảnh...`);

    for (const img of images) {
      try {
        // Optionally resize/compress before writing EXIF
        const sourceDataURL = optimizeSettings
          ? await ImageOptimizer.optimize(img.dataURL, optimizeSettings)
          : img.dataURL;

        // Write EXIF metadata onto the (possibly optimized) image
        const processedDataURL = MetadataManager.writeExif(sourceDataURL, img.metadata);

        // Extract base64 data (remove prefix)
        const base64Data = processedDataURL.split(',')[1];

        if (!base64Data) {
          throw new Error('Empty base64 data after EXIF write');
        }

        // Ensure filename has .jpg extension
        let filename = img.filename;
        if (!/\.jpe?g$/i.test(filename)) {
          filename = filename.replace(/\.[^.]+$/, '') + '.jpg';
        }

        // Add to ZIP
        folder.file(filename, base64Data, { base64: true });

      } catch (err) {
        console.error(`[Downloader] Error processing ${img.filename}:`, err);
        errors++;
        // Still add original image on error
        try {
          const base64Data = img.dataURL.split(',')[1];
          if (base64Data) {
            folder.file(img.filename, base64Data, { base64: true });
          }
        } catch (e) {
          console.error(`[Downloader] Could not even add original for ${img.filename}`);
        }
      }

      processed++;
      const percent = Math.round((processed / total) * 50); // First 50% = processing
      onProgress(percent, `Đang xử lý ${processed}/${total} ảnh...`);
    }

    // Generate ZIP (second 50%)
    onProgress(50, 'Đang nén file ZIP...');
    console.log('[Downloader] Generating ZIP blob...');

    let blob;
    try {
      blob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
        (meta) => {
          const percent = 50 + Math.round(meta.percent / 2);
          onProgress(percent, `Đang nén... ${Math.round(meta.percent)}%`);
        }
      );
    } catch (err) {
      console.error('[Downloader] ZIP generation failed:', err);
      throw new Error('Lỗi tạo file ZIP: ' + err.message);
    }

    console.log(`[Downloader] ZIP blob created: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

    // Trigger download with proper filename
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `geotagged-images-${timestamp}.zip`;

    await this._download(blob, filename);

    const warnMsg = errors > 0 ? ` (${errors} ảnh bị lỗi metadata)` : '';
    onProgress(100, `✅ Hoàn tất! Đã tải ${total} ảnh.${warnMsg}`);
  },

  /**
   * Download a single image with metadata
   * @param {Object} img - Image object
   * @param {Function} onProgress
   */
  async downloadSingle(img, onProgress) {
    onProgress(10, 'Đang xử lý ảnh...');

    // Write EXIF metadata onto the original image (preserving existing metadata)
    const processedDataURL = MetadataManager.writeExif(img.dataURL, img.metadata);

    onProgress(80, 'Đang tải xuống...');

    // Convert data URL to blob
    const byteString = atob(processedDataURL.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: 'image/jpeg' });

    let filename = img.filename;
    if (!/\.jpe?g$/i.test(filename)) {
      filename = filename.replace(/\.[^.]+$/, '') + '.jpg';
    }

    await this._download(blob, filename);
    onProgress(100, '✅ Đã tải ảnh!');
  }
};
