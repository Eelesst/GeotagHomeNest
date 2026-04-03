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
   * Write metadata into a JPEG data URL
   * @param {string} dataURL - Original JPEG as data URL
   * @param {Object} metadata - { title, subject, tags, comment, author, copyright, gps }
   * @returns {string} New JPEG data URL with embedded metadata
   */
  writeExif(dataURL, metadata) {
    console.log('[EXIF] ===== writeExif START (Preserving original EXIF) =====');
    
    let exifObj;
    try {
      exifObj = piexif.load(dataURL);
    } catch (e) {
      // If it fails to load or no EXIF, initialize empty structure
      exifObj = { '0th': {}, 'Exif': {}, 'GPS': {}, '1st': {}, 'Interop': {} };
    }

    // Ensure all IFD objects exist so piexif.dump does not fail
    exifObj['0th'] = exifObj['0th'] || {};
    exifObj['Exif'] = exifObj['Exif'] || {};
    exifObj['GPS'] = exifObj['GPS'] || {};
    exifObj['1st'] = exifObj['1st'] || {};
    exifObj['Interop'] = exifObj['Interop'] || {};

    const dateStr = new Date().toISOString().replace(/-/g, ':').replace('T', ' ').substring(0, 19);

    // --- MANDATORY BOILERPLATE EXIF TAGS FOR WINDOWS EXPLORER COMPATIBILITY ---
    // If we are creating an EXIF block from scratch (because Canva leaves no EXIF),
    // Windows Explorer will silently ignore our user tags unless these structural tags exist.
    exifObj['0th'][piexif.ImageIFD.Make] = exifObj['0th'][piexif.ImageIFD.Make] || 'GeoTag';
    exifObj['0th'][piexif.ImageIFD.Model] = exifObj['0th'][piexif.ImageIFD.Model] || 'Tool';
    exifObj['0th'][piexif.ImageIFD.Orientation] = exifObj['0th'][piexif.ImageIFD.Orientation] || 1;
    exifObj['0th'][piexif.ImageIFD.XResolution] = exifObj['0th'][piexif.ImageIFD.XResolution] || [96, 1];
    exifObj['0th'][piexif.ImageIFD.YResolution] = exifObj['0th'][piexif.ImageIFD.YResolution] || [96, 1];
    exifObj['0th'][piexif.ImageIFD.ResolutionUnit] = exifObj['0th'][piexif.ImageIFD.ResolutionUnit] || 2; // Inches
    exifObj['0th'][piexif.ImageIFD.DateTime] = exifObj['0th'][piexif.ImageIFD.DateTime] || dateStr;
    exifObj['0th'][piexif.ImageIFD.YCbCrPositioning] = exifObj['0th'][piexif.ImageIFD.YCbCrPositioning] || 1;

    exifObj['Exif'][piexif.ExifIFD.ExifVersion] = exifObj['Exif'][piexif.ExifIFD.ExifVersion] || "0230";
    exifObj['Exif'][piexif.ExifIFD.FlashpixVersion] = exifObj['Exif'][piexif.ExifIFD.FlashpixVersion] || "0100";
    exifObj['Exif'][piexif.ExifIFD.ColorSpace] = exifObj['Exif'][piexif.ExifIFD.ColorSpace] || 1; 
    exifObj['Exif'][piexif.ExifIFD.PixelXDimension] = exifObj['Exif'][piexif.ExifIFD.PixelXDimension] || 1000; 
    exifObj['Exif'][piexif.ExifIFD.PixelYDimension] = exifObj['Exif'][piexif.ExifIFD.PixelYDimension] || 1000;
    exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] = exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] || dateStr;
    exifObj['Exif'][piexif.ExifIFD.DateTimeDigitized] = exifObj['Exif'][piexif.ExifIFD.DateTimeDigitized] || dateStr;

    // We do NOT overwrite Software/Program Name to empty. Windows reads XMP CreatorTool for Canva anyway.

    // All user tags in one structure
    if (metadata.title) {
      exifObj['0th'][piexif.ImageIFD.ImageDescription] = metadata.title;
      exifObj['0th'][40091] = this.encodeUTF16LE(metadata.title);
    }
    if (metadata.subject) {
      exifObj['0th'][40095] = this.encodeUTF16LE(metadata.subject);
    }
    if (metadata.tags) {
      const tagsStr = Array.isArray(metadata.tags) ? metadata.tags.join('; ') : metadata.tags;
      exifObj['0th'][40094] = this.encodeUTF16LE(tagsStr);
    }
    if (metadata.comment) {
      exifObj['0th'][40092] = this.encodeUTF16LE(metadata.comment);
      exifObj['Exif'][piexif.ExifIFD.UserComment] = this.encodeUTF16LE(metadata.comment);
    }
    if (metadata.author) {
      exifObj['0th'][piexif.ImageIFD.Artist] = metadata.author;
      exifObj['0th'][40093] = this.encodeUTF16LE(metadata.author);
    }
    if (metadata.copyright) {
      exifObj['0th'][piexif.ImageIFD.Copyright] = metadata.copyright;
    }
    if (metadata.rating && metadata.rating > 0) {
      const r = parseInt(metadata.rating);
      exifObj['0th'][18246] = r;
      const pct = { 1: 1, 2: 25, 3: 50, 4: 75, 5: 99 };
      exifObj['0th'][18249] = pct[r] || 99;
    }
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

    try {
      const exifStr = piexif.dump(exifObj);
      const result = piexif.insert(exifStr, dataURL);
      console.log('[EXIF] ✅ SUCCESS - result length:', result.length);
      return result;
    } catch (e) {
      console.error('[EXIF] ❌ FAILED (dump/insert):', e.message);
      // Fallback: try removing broken original EXIF entirely and inserting our modified one
      try {
        const cleanDataURL = piexif.remove(dataURL);
        const exifStr = piexif.dump(exifObj);
        console.log('[EXIF] Retrying with piexif.remove() on image data');
        return piexif.insert(exifStr, cleanDataURL);
      } catch (e2) {
         console.error('[EXIF] ❌ FAILED twice:', e2.message);
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
   * Strip ALL metadata from an image by re-rendering through Canvas.
   * => REVERTED: We now return the original dataURL to preserve original headers
   * so Windows EXIF reader does not fail.
   */
  stripAllMetadata(dataURL, quality = 0.95) {
    console.log('[MetadataManager] Skipping Canvas strip to preserve original image headers.');
    return Promise.resolve(dataURL);
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
