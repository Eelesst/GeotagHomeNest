/**
 * MetadataManager - Read/Write EXIF & XP metadata using piexifjs
 * 
 * Handles:
 * - Standard EXIF tags (ImageDescription, Artist, Copyright)
 * - Windows XP tags (XPTitle, XPSubject, XPKeywords, XPComment, XPAuthor)
 * - GPS coordinates (Latitude, Longitude)
 * - UserComment in Exif IFD
 * - XMP removal (Canva/Adobe Program name conflicts)
 */
const MetadataManager = {

  /**
   * Encode a string to UTF-16LE byte array (required for XP tags)
   * @param {string} str
   * @returns {number[]}
   */
  encodeUTF16LE(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      bytes.push(code & 0xFF);
      bytes.push((code >> 8) & 0xFF);
    }
    // Null terminator
    bytes.push(0, 0);
    return bytes;
  },

  /**
   * Encode a string for EXIF UserComment field.
   * UserComment requires an 8-byte character code prefix.
   * Using "UNICODE\0" prefix + UTF-16LE encoded text.
   * @param {string} str
   * @returns {number[]}
   */
  encodeUserComment(str) {
    // "UNICODE\0" preamble (8 bytes)
    const preamble = [0x55, 0x4E, 0x49, 0x43, 0x4F, 0x44, 0x45, 0x00];
    const textBytes = [];
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      textBytes.push(code & 0xFF);
      textBytes.push((code >> 8) & 0xFF);
    }
    return preamble.concat(textBytes);
  },

  /**
   * Convert a string to ASCII-safe version for standard EXIF tags.
   * piexifjs serializes standard tags (ImageDescription, Artist, Copyright)
   * as raw bytes and uses btoa() which only supports Latin1.
   * Non-ASCII characters are transliterated or stripped.
   * @param {string} str
   * @returns {string}
   */
  toASCII(str) {
    if (!str) return '';
    // Simple transliteration for common Vietnamese diacritics
    const viMap = {
      'à':'a','á':'a','ả':'a','ã':'a','ạ':'a',
      'ă':'a','ắ':'a','ằ':'a','ẳ':'a','ẵ':'a','ặ':'a',
      'â':'a','ấ':'a','ầ':'a','ẩ':'a','ẫ':'a','ậ':'a',
      'è':'e','é':'e','ẻ':'e','ẽ':'e','ẹ':'e',
      'ê':'e','ế':'e','ề':'e','ể':'e','ễ':'e','ệ':'e',
      'ì':'i','í':'i','ỉ':'i','ĩ':'i','ị':'i',
      'ò':'o','ó':'o','ỏ':'o','õ':'o','ọ':'o',
      'ô':'o','ố':'o','ồ':'o','ổ':'o','ỗ':'o','ộ':'o',
      'ơ':'o','ớ':'o','ờ':'o','ở':'o','ỡ':'o','ợ':'o',
      'ù':'u','ú':'u','ủ':'u','ũ':'u','ụ':'u',
      'ư':'u','ứ':'u','ừ':'u','ử':'u','ữ':'u','ự':'u',
      'ỳ':'y','ý':'y','ỷ':'y','ỹ':'y','ỵ':'y',
      'đ':'d',
      'À':'A','Á':'A','Ả':'A','Ã':'A','Ạ':'A',
      'Ă':'A','Ắ':'A','Ằ':'A','Ẳ':'A','Ẵ':'A','Ặ':'A',
      'Â':'A','Ấ':'A','Ầ':'A','Ẩ':'A','Ẫ':'A','Ậ':'A',
      'È':'E','É':'E','Ẻ':'E','Ẽ':'E','Ẹ':'E',
      'Ê':'E','Ế':'E','Ề':'E','Ể':'E','Ễ':'E','Ệ':'E',
      'Ì':'I','Í':'I','Ỉ':'I','Ĩ':'I','Ị':'I',
      'Ò':'O','Ó':'O','Ỏ':'O','Õ':'O','Ọ':'O',
      'Ô':'O','Ố':'O','Ồ':'O','Ổ':'O','Ỗ':'O','Ộ':'O',
      'Ơ':'O','Ớ':'O','Ờ':'O','Ở':'O','Ỡ':'O','Ợ':'O',
      'Ù':'U','Ú':'U','Ủ':'U','Ũ':'U','Ụ':'U',
      'Ư':'U','Ứ':'U','Ừ':'U','Ử':'U','Ữ':'U','Ự':'U',
      'Ỳ':'Y','Ý':'Y','Ỷ':'Y','Ỹ':'Y','Ỵ':'Y',
      'Đ':'D'
    };
    let result = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const code = ch.charCodeAt(0);
      if (code < 128) {
        result += ch; // ASCII as-is
      } else if (viMap[ch]) {
        result += viMap[ch]; // Vietnamese → ASCII
      } else if (ch === '©') {
        result += '(c)';
      } else {
        result += '?'; // Other non-ASCII → ?
      }
    }
    return result;
  },

  /**
   * Decode UTF-16LE byte array to string
   * @param {number[]} bytes
   * @returns {string}
   */
  decodeUTF16LE(bytes) {
    if (!bytes || !Array.isArray(bytes) || bytes.length < 2) return '';
    let str = '';
    for (let i = 0; i < bytes.length - 1; i += 2) {
      const code = bytes[i] | (bytes[i + 1] << 8);
      if (code === 0) break;
      str += String.fromCharCode(code);
    }
    return str;
  },

  /**
   * Read existing EXIF metadata from a JPEG data URL
   * @param {string} dataURL - JPEG as data URL
   * @returns {Object} Extracted metadata
   */
  readExif(dataURL) {
    const result = {
      title: '',
      subject: '',
      tags: '',
      comment: '',
      author: '',
      copyright: '',
      rating: 0,
      gps: null
    };

    try {
      const exifObj = piexif.load(dataURL);

      // Standard tags
      const zeroth = exifObj['0th'] || {};
      const exifIFD = exifObj['Exif'] || {};
      const gpsIFD = exifObj['GPS'] || {};

      // ImageDescription → Title fallback
      if (zeroth[piexif.ImageIFD.ImageDescription]) {
        result.title = zeroth[piexif.ImageIFD.ImageDescription];
      }

      // Artist
      if (zeroth[piexif.ImageIFD.Artist]) {
        result.author = zeroth[piexif.ImageIFD.Artist];
      }

      // Copyright
      if (zeroth[piexif.ImageIFD.Copyright]) {
        result.copyright = zeroth[piexif.ImageIFD.Copyright];
      }

      // XP Tags (override standard tags if present — Windows uses these)
      if (zeroth[40091]) {
        result.title = this.decodeUTF16LE(zeroth[40091]) || result.title;
      }
      if (zeroth[40095]) {
        result.subject = this.decodeUTF16LE(zeroth[40095]);
      }
      if (zeroth[40094]) {
        result.tags = this.decodeUTF16LE(zeroth[40094]);
      }
      if (zeroth[40092]) {
        result.comment = this.decodeUTF16LE(zeroth[40092]);
      }
      if (zeroth[40093]) {
        result.author = this.decodeUTF16LE(zeroth[40093]) || result.author;
      }

      // Rating (tag 18246 = Rating, tag 18249 = RatingPercent)
      if (zeroth[18246]) {
        result.rating = zeroth[18246];
      }

      // GPS coordinates
      if (gpsIFD[piexif.GPSIFD.GPSLatitude] && gpsIFD[piexif.GPSIFD.GPSLongitude]) {
        try {
          const lat = piexif.GPSHelper.dmsRationalToDeg(
            gpsIFD[piexif.GPSIFD.GPSLatitude],
            gpsIFD[piexif.GPSIFD.GPSLatitudeRef] || 'N'
          );
          const lng = piexif.GPSHelper.dmsRationalToDeg(
            gpsIFD[piexif.GPSIFD.GPSLongitude],
            gpsIFD[piexif.GPSIFD.GPSLongitudeRef] || 'E'
          );
          result.gps = { lat, lng };
        } catch (gpsErr) {
          console.warn('GPS parsing error:', gpsErr);
        }
      }

    } catch (e) {
      // File might not have EXIF — that's OK
      console.warn('Could not read EXIF:', e.message);
    }

    return result;
  },

  /**
   * Remove XMP and IPTC metadata from a JPEG data URL at the binary level.
   * 
   * WHY: Windows Explorer prioritizes XMP over EXIF. Canva images have XMP with
   * empty Title/Subject/Tags but a filled "CreatorTool" (Program name).
   * This causes Windows to show empty fields even when our EXIF has data.
   * Removing XMP forces Windows to fall back to our EXIF.
   * 
   * Also removes APP13 (IPTC/Photoshop) which can have similar conflicts.
   *
   * @param {string} dataURL - JPEG as data URL
   * @returns {string} JPEG data URL without XMP/IPTC segments
   */
  removeNonExifMetadata(dataURL) {
    try {
      const base64 = dataURL.split(',')[1];
      if (!base64) return dataURL;

      const binaryStr = atob(base64);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Verify JPEG (SOI = 0xFFD8)
      if (len < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
        console.warn('[MetaStrip] Not a JPEG file, skipping');
        return dataURL;
      }

      // Scan segments, collect ranges to keep
      const keepRanges = [];
      keepRanges.push([0, 2]); // SOI marker

      let pos = 2;
      let removedCount = 0;

      while (pos < len - 1) {
        // Skip any 0xFF padding bytes
        while (pos < len - 1 && bytes[pos] === 0xFF && bytes[pos + 1] === 0xFF) {
          pos++;
        }

        if (pos >= len - 1) break;

        if (bytes[pos] !== 0xFF) {
          // Non-marker data — copy the rest
          keepRanges.push([pos, len]);
          break;
        }

        const marker = bytes[pos + 1];

        // SOS (0xDA) — rest of file is compressed image data
        if (marker === 0xDA) {
          keepRanges.push([pos, len]);
          break;
        }

        // EOI (0xD9)
        if (marker === 0xD9) {
          keepRanges.push([pos, pos + 2]);
          break;
        }

        // RST markers (0xD0-0xD7), SOI (0xD8), TEM (0x01) — no length field
        if ((marker >= 0xD0 && marker <= 0xD8) || marker === 0x01) {
          keepRanges.push([pos, pos + 2]);
          pos += 2;
          continue;
        }

        // All other segments have a 2-byte length field after the marker
        if (pos + 3 >= len) break;
        const segLen = (bytes[pos + 2] << 8) | bytes[pos + 3];
        if (segLen < 2) break; // Invalid
        const segEnd = pos + 2 + segLen;
        if (segEnd > len) break; // Truncated

        // Determine if this segment should be removed
        let shouldRemove = false;

        // APP1 (0xE1) — check for XMP
        if (marker === 0xE1 && segLen > 30) {
          const xmpIdentifiers = [
            "http://ns.adobe.com/xap/1.0/",
            "http://ns.adobe.com/xmp/extension/"
          ];
          for (const xmpNS of xmpIdentifiers) {
            if (pos + 4 + xmpNS.length <= len) {
              let match = true;
              for (let i = 0; i < xmpNS.length; i++) {
                if (bytes[pos + 4 + i] !== xmpNS.charCodeAt(i)) {
                  match = false;
                  break;
                }
              }
              if (match) {
                shouldRemove = true;
                console.log(`[MetaStrip] Removing XMP APP1 at offset ${pos} (${segLen} bytes)`);
                break;
              }
            }
          }
        }

        // APP13 (0xED) — IPTC/Photoshop metadata
        if (marker === 0xED) {
          shouldRemove = true;
          console.log(`[MetaStrip] Removing IPTC APP13 at offset ${pos} (${segLen} bytes)`);
        }

        // APP2 (0xE2) — could be ICC profile or extended XMP, remove extended XMP only
        if (marker === 0xE2 && segLen > 30) {
          const mpfHeader = "MPF\x00";
          let isMPF = true;
          for (let i = 0; i < mpfHeader.length && pos + 4 + i < len; i++) {
            if (bytes[pos + 4 + i] !== mpfHeader.charCodeAt(i)) {
              isMPF = false;
              break;
            }
          }
          // Don't remove ICC profiles (they start with "ICC_PROFILE\0")
          // Only remove MPF (Multi-Picture Format) which Canva sometimes adds
          if (isMPF) {
            shouldRemove = true;
            console.log(`[MetaStrip] Removing MPF APP2 at offset ${pos} (${segLen} bytes)`);
          }
        }

        if (shouldRemove) {
          removedCount++;
          pos = segEnd;
          continue;
        }

        // Keep this segment
        keepRanges.push([pos, segEnd]);
        pos = segEnd;
      }

      if (removedCount === 0) {
        console.log('[MetaStrip] No XMP/IPTC metadata found to remove');
        return dataURL;
      }

      // Rebuild JPEG from kept ranges
      let totalLen = 0;
      keepRanges.forEach(([s, e]) => totalLen += (e - s));

      const output = new Uint8Array(totalLen);
      let outPos = 0;
      keepRanges.forEach(([s, e]) => {
        output.set(bytes.subarray(s, e), outPos);
        outPos += (e - s);
      });

      // Convert back to base64 data URL (process in chunks to avoid stack overflow)
      let bin = '';
      const chunkSize = 0x8000; // 32KB
      for (let i = 0; i < output.length; i += chunkSize) {
        const end = Math.min(i + chunkSize, output.length);
        bin += String.fromCharCode.apply(null, output.subarray(i, end));
      }

      console.log(`[MetaStrip] ✅ Removed ${removedCount} segments: ${len} → ${totalLen} bytes`);
      return 'data:image/jpeg;base64,' + btoa(bin);

    } catch (e) {
      console.warn('[MetaStrip] Failed:', e.message);
      return dataURL; // Return original on failure
    }
  },

  /**
   * Write metadata into a JPEG data URL.
   * 
   * Strategy (robust, works with Canva and all sources):
   * 1. Remove XMP/IPTC metadata (prevents Windows from ignoring our EXIF)
   * 2. Remove existing EXIF (avoids incompatible tags crashing piexif.dump)
   * 3. Build a completely fresh EXIF structure with our metadata
   * 4. Insert fresh EXIF into the clean image
   * 
   * This is safe because readImageFile() already reads existing EXIF values
   * into img.metadata at upload time, so nothing is lost.
   *
   * @param {string} dataURL - Original JPEG as data URL
   * @param {Object} metadata - { title, subject, tags, comment, author, copyright, rating, gps }
   * @returns {string} New JPEG data URL with embedded metadata
   */
  writeExif(dataURL, metadata) {
    console.log('[EXIF] ===== writeExif START =====');
    console.log('[EXIF] Metadata to write:', JSON.stringify({
      title: metadata.title ? metadata.title.substring(0, 30) + '...' : '(empty)',
      subject: metadata.subject ? 'yes' : '(empty)',
      tags: metadata.tags ? 'yes' : '(empty)',
      comment: metadata.comment ? 'yes' : '(empty)',
      author: metadata.author || '(empty)',
      copyright: metadata.copyright || '(empty)',
      rating: metadata.rating || 0,
      gps: metadata.gps ? 'yes' : 'no'
    }));

    // Step 1: Remove XMP/IPTC metadata that conflicts with EXIF in Windows
    dataURL = this.removeNonExifMetadata(dataURL);

    // Step 2: Remove existing EXIF to avoid incompatible tags crashing piexif.dump
    try {
      dataURL = piexif.remove(dataURL);
      console.log('[EXIF] Removed existing EXIF');
    } catch (e) {
      console.log('[EXIF] No existing EXIF to remove (OK)');
    }

    // Step 3: Build a completely fresh EXIF structure
    const exifObj = {
      '0th': {},
      'Exif': {},
      'GPS': {},
      '1st': {},
      'Interop': {}
    };

    // --- Minimal structural boilerplate (required for valid EXIF) ---
    exifObj['0th'][piexif.ImageIFD.Orientation] = 1;
    exifObj['0th'][piexif.ImageIFD.XResolution] = [96, 1];
    exifObj['0th'][piexif.ImageIFD.YResolution] = [96, 1];
    exifObj['0th'][piexif.ImageIFD.ResolutionUnit] = 2;
    exifObj['0th'][piexif.ImageIFD.YCbCrPositioning] = 1;

    // NOTE: We intentionally do NOT set Exif IFD entries (ExifVersion, 
    // DateTimeOriginal, UserComment, etc.) because piexifjs serializes
    // them incorrectly, causing garbled byte data in Windows Explorer.

    // --- User metadata (XP tags only — guaranteed Unicode support) ---

    // Title → XPTitle (Windows Unicode tag)
    if (metadata.title) {
      exifObj['0th'][40091] = this.encodeUTF16LE(metadata.title); // XPTitle
    }

    // Subject → XPSubject
    if (metadata.subject) {
      exifObj['0th'][40095] = this.encodeUTF16LE(metadata.subject); // XPSubject
    }

    // Tags → XPKeywords
    if (metadata.tags) {
      const tagsStr = Array.isArray(metadata.tags) ? metadata.tags.join('; ') : metadata.tags;
      exifObj['0th'][40094] = this.encodeUTF16LE(tagsStr); // XPKeywords
    }

    // Comment → XPComment (Windows) and UserComment (Standard EXIF)
    if (metadata.comment) {
      exifObj['0th'][40092] = this.encodeUTF16LE(metadata.comment); // XPComment
      exifObj['Exif'][piexif.ExifIFD.UserComment] = this.encodeUserComment(metadata.comment); // Standard UserComment
    }

    // Author → XPAuthor only (no Artist standard tag to avoid conflict)
    if (metadata.author) {
      exifObj['0th'][40093] = this.encodeUTF16LE(metadata.author); // XPAuthor
    }

    // Copyright (ASCII string — standard EXIF tag, works fine alone)
    if (metadata.copyright) {
      const asciiCopyright = this.toASCII(metadata.copyright);
      if (asciiCopyright) {
        exifObj['0th'][piexif.ImageIFD.Copyright] = asciiCopyright;
      }
    }

    // Rating (0-5 stars)
    if (metadata.rating && metadata.rating > 0) {
      const r = parseInt(metadata.rating);
      exifObj['0th'][18246] = r; // Rating
      const pct = { 1: 1, 2: 25, 3: 50, 4: 75, 5: 99 };
      exifObj['0th'][18249] = pct[r] || 99; // RatingPercent
    }

    // GPS coordinates
    if (metadata.gps && metadata.gps.lat != null && metadata.gps.lng != null) {
      const lat = parseFloat(metadata.gps.lat);
      const lng = parseFloat(metadata.gps.lng);
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        exifObj['GPS'][piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0];
        exifObj['GPS'][piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? 'N' : 'S';
        exifObj['GPS'][piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lat));
        exifObj['GPS'][piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? 'E' : 'W';
        exifObj['GPS'][piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lng));
        exifObj['GPS'][piexif.GPSIFD.GPSAltitudeRef] = 0;
        exifObj['GPS'][piexif.GPSIFD.GPSAltitude] = [0, 1];
      }
    }

    // Step 4: Dump and insert
    try {
      const exifStr = piexif.dump(exifObj);
      const result = piexif.insert(exifStr, dataURL);
      console.log('[EXIF] ✅ SUCCESS - output length:', result.length);
      return result;
    } catch (e) {
      console.error('[EXIF] ❌ FAILED:', e.message);
      console.error('[EXIF] Stack:', e.stack);
      // Return the cleaned image (XMP/IPTC removed, even if EXIF insert failed)
      return dataURL;
    }
  },

  /**
   * Convert a non-JPEG image (PNG, WebP, etc.) to JPEG data URL via canvas
   * @param {string} dataURL - Source image data URL
   * @param {number} quality - JPEG quality (0-1)
   * @returns {Promise<string>} JPEG data URL
   */
  convertToJPEG(dataURL, quality = 0.92) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        // White background (JPEG has no transparency)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const jpegDataURL = canvas.toDataURL('image/jpeg', quality);
        resolve(jpegDataURL);
      };
      img.onerror = () => reject(new Error('Failed to load image for conversion'));
      img.src = dataURL;
    });
  },

  /**
   * Check if a data URL is JPEG
   * @param {string} dataURL
   * @returns {boolean}
   */
  isJPEG(dataURL) {
    return dataURL.startsWith('data:image/jpeg') || dataURL.startsWith('data:image/jpg');
  }
};
