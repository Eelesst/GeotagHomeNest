/**
 * MetadataManager - Read/Write EXIF & XP metadata using piexifjs
 * 
 * Handles:
 * - Standard EXIF tags (ImageDescription, Artist, Copyright)
 * - Windows XP tags (XPTitle, XPSubject, XPKeywords, XPComment, XPAuthor)
 * - GPS coordinates (Latitude, Longitude)
 * - UserComment in Exif IFD
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
   * Write metadata into a JPEG data URL
   * @param {string} dataURL - Original JPEG as data URL
   * @param {Object} metadata - { title, subject, tags, comment, author, copyright, gps }
   * @returns {string} New JPEG data URL with embedded metadata
   */
  writeExif(dataURL, metadata) {
    let exifObj;
    try {
      exifObj = piexif.load(dataURL);
    } catch (e) {
      // Create fresh EXIF structure
      exifObj = {
        '0th': {},
        'Exif': {},
        'GPS': {},
        '1st': {},
        'Interop': {},
      };
    }

    // Ensure IFDs exist
    if (!exifObj['0th']) exifObj['0th'] = {};
    if (!exifObj['Exif']) exifObj['Exif'] = {};
    if (!exifObj['GPS']) exifObj['GPS'] = {};

    // --- Write Title ---
    if (metadata.title) {
      exifObj['0th'][piexif.ImageIFD.ImageDescription] = metadata.title;
      exifObj['0th'][40091] = this.encodeUTF16LE(metadata.title); // XPTitle
    }

    // --- Write Subject ---
    if (metadata.subject) {
      exifObj['0th'][40095] = this.encodeUTF16LE(metadata.subject); // XPSubject
    }

    // --- Write Tags/Keywords ---
    if (metadata.tags) {
      const tagsStr = Array.isArray(metadata.tags) ? metadata.tags.join('; ') : metadata.tags;
      exifObj['0th'][40094] = this.encodeUTF16LE(tagsStr); // XPKeywords
    }

    // --- Write Comment ---
    if (metadata.comment) {
      exifObj['0th'][40092] = this.encodeUTF16LE(metadata.comment); // XPComment
    }

    // --- Write Author ---
    if (metadata.author) {
      exifObj['0th'][piexif.ImageIFD.Artist] = metadata.author;
      exifObj['0th'][40093] = this.encodeUTF16LE(metadata.author); // XPAuthor
    }

    // --- Write Copyright ---
    if (metadata.copyright) {
      exifObj['0th'][piexif.ImageIFD.Copyright] = metadata.copyright;
    }

    // --- Write GPS ---
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
        console.log(`[EXIF] GPS written: ${lat}, ${lng}`);
      } else {
        console.warn(`[EXIF] Invalid GPS values: lat=${lat}, lng=${lng}`);
      }
    }

    // Build and insert EXIF
    try {
      const exifStr = piexif.dump(exifObj);
      const result = piexif.insert(exifStr, dataURL);
      console.log('[EXIF] Metadata written successfully');
      return result;
    } catch (e) {
      console.error('[EXIF] Error writing EXIF:', e);
      // Try again with a clean EXIF structure (strip problematic fields)
      try {
        const cleanExif = { '0th': {}, 'Exif': {}, 'GPS': {}, '1st': {}, 'Interop': {} };
        // Copy only safe fields
        if (metadata.title) {
          cleanExif['0th'][piexif.ImageIFD.ImageDescription] = metadata.title;
          cleanExif['0th'][40091] = this.encodeUTF16LE(metadata.title);
        }
        if (metadata.author) {
          cleanExif['0th'][piexif.ImageIFD.Artist] = metadata.author;
          cleanExif['0th'][40093] = this.encodeUTF16LE(metadata.author);
        }
        if (metadata.copyright) {
          cleanExif['0th'][piexif.ImageIFD.Copyright] = metadata.copyright;
        }
        if (metadata.gps && metadata.gps.lat != null && metadata.gps.lng != null) {
          const lat2 = parseFloat(metadata.gps.lat);
          const lng2 = parseFloat(metadata.gps.lng);
          if (!isNaN(lat2) && !isNaN(lng2)) {
            cleanExif['GPS'][piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0];
            cleanExif['GPS'][piexif.GPSIFD.GPSLatitudeRef] = lat2 >= 0 ? 'N' : 'S';
            cleanExif['GPS'][piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lat2));
            cleanExif['GPS'][piexif.GPSIFD.GPSLongitudeRef] = lng2 >= 0 ? 'E' : 'W';
            cleanExif['GPS'][piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lng2));
          }
        }
        const cleanStr = piexif.dump(cleanExif);
        // Need to strip existing EXIF first
        const stripped = piexif.remove(dataURL);
        const result = piexif.insert(cleanStr, stripped);
        console.log('[EXIF] Metadata written with clean fallback');
        return result;
      } catch (e2) {
        console.error('[EXIF] Clean fallback also failed:', e2);
        return dataURL;
      }
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
