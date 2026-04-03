/**
 * App - Main orchestrator for Image GeoTag & Metadata Tool
 *
 * Manages:
 * - Image upload (drag & drop + file browse)
 * - State management for all images
 * - Metadata form binding
 * - Map ↔ Form sync
 * - Google Vision API integration
 * - Batch operations
 * - Download orchestration
 */
const App = {
  // ==================== STATE ====================
  state: {
    images: [],         // Array of image objects
    selectedId: null,   // Currently selected image ID
    globalSettings: {
      author: '',
      copyright: '',
      websiteUrl: '',
      autoRating: true,
      apiKey: '',
      aiMode: false
    }
  },

  // ==================== INITIALIZATION ====================
  init() {
    this.bindUploadEvents();
    this.bindFormEvents();
    this.bindGPSEvents();
    this.bindActionEvents();
    this.bindSettingsEvents();

    // Initialize map
    GeoTagger.init('map');
    GeoTagger.onCoordsChange = (coords) => this.onMapCoordsChange(coords);

    console.log('✅ Image GeoTag & Metadata Tool initialized');
  },

  // ==================== UPLOAD HANDLING ====================
  bindUploadEvents() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    // Click to browse
    dropZone.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFiles(e.target.files);
        fileInput.value = ''; // Reset to allow re-uploading same files
      }
    });

    // Drag events
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFiles(files);
      }
    });
  },

  /**
   * Process uploaded files
   * @param {FileList} files
   */
  async handleFiles(files) {
    const imageFiles = Array.from(files).filter(f =>
      f.type.startsWith('image/')
    );

    if (imageFiles.length === 0) {
      this.showToast('Không tìm thấy file ảnh hợp lệ', 'warning');
      return;
    }

    this.showToast(`Đang tải ${imageFiles.length} ảnh...`, 'info');

    // Make upload zone compact after first upload
    const dropZone = document.getElementById('dropZone');
    dropZone.classList.add('compact');

    let loadedCount = 0;

    for (const file of imageFiles) {
      try {
        const imageObj = await this.readImageFile(file);
        this.state.images.push(imageObj);
        loadedCount++;
      } catch (err) {
        console.error(`Failed to load ${file.name}:`, err);
      }
    }

    this.renderImageGrid();
    this.updateStats();
    this.updateButtonStates();

    // Auto-select first image if none selected
    if (!this.state.selectedId && this.state.images.length > 0) {
      this.selectImage(this.state.images[0].id);
    }

    this.showToast(`✅ Đã tải ${loadedCount} ảnh thành công!`, 'success');
  },

  /**
   * Read a single image file and create an image object
   * @param {File} file
   * @returns {Promise<Object>}
   */
  readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        let dataURL = e.target.result;

        // Convert non-JPEG to JPEG for EXIF support
        if (!MetadataManager.isJPEG(dataURL)) {
          try {
            dataURL = await MetadataManager.convertToJPEG(dataURL);
          } catch (err) {
            console.warn(`Could not convert ${file.name} to JPEG:`, err);
          }
        }

        // Parse filename for metadata
        const parsed = FilenameParser.parse(file.name);

        // Try to read existing EXIF
        const existingExif = MetadataManager.readExif(dataURL);

        // Create image object
        const imageObj = {
          id: this.generateId(),
          file: file,
          filename: file.name,
          dataURL: dataURL,
          preview: await this.createThumbnail(dataURL, 200),
          metadata: {
            title: existingExif.title || parsed.title,
            subject: existingExif.subject || parsed.subject,
            tags: existingExif.tags || parsed.tags.join('; '),
            comment: existingExif.comment || parsed.comment,
            author: existingExif.author || this.state.globalSettings.author,
            copyright: existingExif.copyright || this.state.globalSettings.copyright,
            rating: existingExif.rating || (this.state.globalSettings.autoRating ? 5 : 0),
            gps: existingExif.gps || null
          },
          aiProcessed: false
        };

        // If image has existing GPS, add marker on map
        if (imageObj.metadata.gps) {
          GeoTagger.addImageMarker(
            imageObj.id,
            imageObj.metadata.gps.lat,
            imageObj.metadata.gps.lng,
            imageObj.filename
          );
        }

        resolve(imageObj);
      };

      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });
  },

  /**
   * Create a thumbnail from a data URL
   * @param {string} dataURL
   * @param {number} maxSize
   * @returns {Promise<string>}
   */
  createThumbnail(dataURL, maxSize) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.naturalWidth;
        let h = img.naturalHeight;

        if (w > h) {
          if (w > maxSize) { h = h * (maxSize / w); w = maxSize; }
        } else {
          if (h > maxSize) { w = w * (maxSize / h); h = maxSize; }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(dataURL); // fallback
      img.src = dataURL;
    });
  },

  // ==================== IMAGE GRID RENDERING ====================
  renderImageGrid() {
    const grid = document.getElementById('imageGrid');

    if (this.state.images.length === 0) {
      grid.innerHTML = `
        <div class="image-grid-empty">
          <span class="icon">🖼️</span>
          <p>Chưa có ảnh nào. Hãy upload ảnh ở trên.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = this.state.images.map(img => `
      <div class="image-thumb ${img.id === this.state.selectedId ? 'selected' : ''}"
           data-id="${img.id}" onclick="App.selectImage('${img.id}')">
        <img src="${img.preview}" alt="${img.filename}" loading="lazy">
        <div class="overlay">${this.truncate(img.filename, 18)}</div>
        <div class="gps-badge ${img.metadata.gps ? 'active' : ''}">📍</div>
        <button class="remove-btn" onclick="event.stopPropagation(); App.removeImage('${img.id}')" title="Xóa ảnh">✕</button>
      </div>
    `).join('');
  },

  /**
   * Select an image and populate the metadata form
   * @param {string} imageId
   */
  selectImage(imageId) {
    this.state.selectedId = imageId;
    const img = this.getImageById(imageId);
    if (!img) return;

    // Update grid selection
    document.querySelectorAll('.image-thumb').forEach(el => {
      el.classList.toggle('selected', el.dataset.id === imageId);
    });

    // Enable form
    const formFields = document.getElementById('formFields');
    formFields.classList.remove('form-disabled');

    // Populate form
    document.getElementById('selectedFileName').textContent = img.filename;
    document.getElementById('metaTitle').value = img.metadata.title || '';
    document.getElementById('metaSubject').value = img.metadata.subject || '';
    document.getElementById('metaTags').value = img.metadata.tags || '';
    document.getElementById('metaComment').value = img.metadata.comment || '';

    // GPS display
    if (img.metadata.gps) {
      document.getElementById('metaGps').value =
        `${img.metadata.gps.lat.toFixed(6)}, ${img.metadata.gps.lng.toFixed(6)}`;
      document.getElementById('gpsLat').value = img.metadata.gps.lat.toFixed(6);
      document.getElementById('gpsLng').value = img.metadata.gps.lng.toFixed(6);

      // Set marker on map
      GeoTagger.setCoords(img.metadata.gps.lat, img.metadata.gps.lng);
    } else {
      document.getElementById('metaGps').value = '';
      document.getElementById('gpsLat').value = '';
      document.getElementById('gpsLng').value = '';
      GeoTagger.clearMarker();
    }
  },

  /**
   * Remove an image from the list
   * @param {string} imageId
   */
  removeImage(imageId) {
    this.state.images = this.state.images.filter(img => img.id !== imageId);
    GeoTagger.removeImageMarker(imageId);

    if (this.state.selectedId === imageId) {
      this.state.selectedId = null;
      this.clearForm();

      // Select next image if available
      if (this.state.images.length > 0) {
        this.selectImage(this.state.images[0].id);
      }
    }

    this.renderImageGrid();
    this.updateStats();
    this.updateButtonStates();

    if (this.state.images.length === 0) {
      document.getElementById('dropZone').classList.remove('compact');
    }
  },

  // ==================== FORM EVENTS ====================
  bindFormEvents() {
    // Auto-save form changes to state
    const fields = ['metaTitle', 'metaSubject', 'metaTags', 'metaComment'];
    const keys = ['title', 'subject', 'tags', 'comment'];

    fields.forEach((fieldId, i) => {
      document.getElementById(fieldId).addEventListener('input', (e) => {
        const img = this.getSelectedImage();
        if (img) {
          img.metadata[keys[i]] = e.target.value;
        }
      });
    });
  },

  clearForm() {
    document.getElementById('selectedFileName').textContent = 'Chưa chọn ảnh';
    document.getElementById('metaTitle').value = '';
    document.getElementById('metaSubject').value = '';
    document.getElementById('metaTags').value = '';
    document.getElementById('metaComment').value = '';
    document.getElementById('metaGps').value = '';
    document.getElementById('gpsLat').value = '';
    document.getElementById('gpsLng').value = '';
    document.getElementById('formFields').classList.add('form-disabled');
  },

  // ==================== GPS EVENTS ====================
  bindGPSEvents() {
    // Manual coordinate input
    const gpsLat = document.getElementById('gpsLat');
    const gpsLng = document.getElementById('gpsLng');

    const updateMapFromInputs = () => {
      const lat = parseFloat(gpsLat.value);
      const lng = parseFloat(gpsLng.value);
      if (!isNaN(lat) && !isNaN(lng)) {
        GeoTagger.setCoords(lat, lng);
      }
    };

    gpsLat.addEventListener('change', updateMapFromInputs);
    gpsLng.addEventListener('change', updateMapFromInputs);

    // Address search
    document.getElementById('btnSearchAddress').addEventListener('click', () => {
      this.searchAddress();
    });

    document.getElementById('addressSearch').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.searchAddress();
    });

    // Apply GPS button
    document.getElementById('btnApplyGps').addEventListener('click', () => {
      this.applyGPS();
    });
  },

  /**
   * Called when map coordinates change (click or drag)
   * @param {Object} coords - { lat, lng }
   */
  onMapCoordsChange(coords) {
    // Update input fields
    document.getElementById('gpsLat').value = coords.lat.toFixed(6);
    document.getElementById('gpsLng').value = coords.lng.toFixed(6);

    // Enable apply button
    document.getElementById('btnApplyGps').disabled = false;
  },

  /**
   * Search for an address
   */
  async searchAddress() {
    const query = document.getElementById('addressSearch').value.trim();
    if (!query) return;

    const btn = document.getElementById('btnSearchAddress');
    btn.textContent = '⏳';
    btn.disabled = true;

    try {
      const results = await GeoTagger.searchAddress(query);
      this.renderSearchResults(results);
    } catch (err) {
      this.showToast('Lỗi tìm kiếm địa chỉ', 'error');
    } finally {
      btn.textContent = 'Tìm';
      btn.disabled = false;
    }
  },

  /**
   * Render address search results
   * @param {Array} results
   */
  renderSearchResults(results) {
    const container = document.getElementById('searchResults');

    if (!results || results.length === 0) {
      container.innerHTML = '<div class="search-result-item">Không tìm thấy kết quả</div>';
      return;
    }

    container.innerHTML = results.map(r => `
      <div class="search-result-item" onclick="App.selectSearchResult(${r.lat}, ${r.lon})">
        📍 ${r.display_name}
      </div>
    `).join('');
  },

  /**
   * Select a search result
   * @param {number} lat
   * @param {number} lng
   */
  selectSearchResult(lat, lng) {
    GeoTagger.setCoords(lat, lng);
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('addressSearch').value = '';
  },

  /**
   * Apply GPS coordinates to images based on selected mode
   */
  applyGPS() {
    const coords = GeoTagger.getCoords();
    if (!coords) {
      this.showToast('Chưa chọn tọa độ GPS trên bản đồ', 'warning');
      return;
    }

    const mode = document.querySelector('input[name="gpsApply"]:checked').value;
    let count = 0;

    switch (mode) {
      case 'single': {
        const img = this.getSelectedImage();
        if (img) {
          img.metadata.gps = { ...coords };
          GeoTagger.addImageMarker(img.id, coords.lat, coords.lng, img.filename);
          count = 1;
        } else {
          this.showToast('Chưa chọn ảnh nào', 'warning');
          return;
        }
        break;
      }
      case 'empty':
        this.state.images.forEach(img => {
          if (!img.metadata.gps) {
            img.metadata.gps = { ...coords };
            GeoTagger.addImageMarker(img.id, coords.lat, coords.lng, img.filename);
            count++;
          }
        });
        break;
      case 'all':
        this.state.images.forEach(img => {
          img.metadata.gps = { ...coords };
          GeoTagger.addImageMarker(img.id, coords.lat, coords.lng, img.filename);
          count++;
        });
        break;
    }

    // Update GPS display for the currently selected image
    const selectedImg = this.getSelectedImage();
    if (selectedImg && selectedImg.metadata.gps) {
      document.getElementById('metaGps').value =
        `${selectedImg.metadata.gps.lat.toFixed(6)}, ${selectedImg.metadata.gps.lng.toFixed(6)}`;
    }

    this.renderImageGrid();
    this.updateStats();
    this.showToast(`📍 Đã gắn GPS cho ${count} ảnh`, 'success');
  },

  // ==================== SETTINGS EVENTS ====================
  bindSettingsEvents() {
    // AI mode toggle
    document.getElementById('aiModeToggle').addEventListener('change', (e) => {
      this.state.globalSettings.aiMode = e.target.checked;
      document.getElementById('apiKeyGroup').style.display = e.target.checked ? 'flex' : 'none';
    });

    // Auto Rating toggle
    document.getElementById('autoRatingToggle').addEventListener('change', (e) => {
      this.state.globalSettings.autoRating = e.target.checked;
      try { localStorage.setItem('geotag_auto_rating', e.target.checked ? '1' : '0'); } catch(ex) {}
    });

    // Global author/copyright/website inputs
    document.getElementById('globalAuthor').addEventListener('input', (e) => {
      this.state.globalSettings.author = e.target.value;
    });
    document.getElementById('globalCopyright').addEventListener('input', (e) => {
      this.state.globalSettings.copyright = e.target.value;
    });
    document.getElementById('globalWebsiteUrl').addEventListener('input', (e) => {
      this.state.globalSettings.websiteUrl = e.target.value.trim();
    });
    document.getElementById('globalApiKey').addEventListener('input', (e) => {
      this.state.globalSettings.apiKey = e.target.value;
      // Save to localStorage for persistence
      try { localStorage.setItem('geotag_api_key', e.target.value); } catch(ex) {}
    });

    // Restore API key from localStorage
    try {
      const savedKey = localStorage.getItem('geotag_api_key');
      if (savedKey) {
        document.getElementById('globalApiKey').value = savedKey;
        this.state.globalSettings.apiKey = savedKey;
      }
    } catch(ex) {}

    // Restore author/copyright/website/rating from localStorage
    try {
      const savedAuthor = localStorage.getItem('geotag_author');
      const savedCopyright = localStorage.getItem('geotag_copyright');
      const savedWebsite = localStorage.getItem('geotag_website_url');
      const savedRating = localStorage.getItem('geotag_auto_rating');
      if (savedAuthor) {
        document.getElementById('globalAuthor').value = savedAuthor;
        this.state.globalSettings.author = savedAuthor;
      }
      if (savedCopyright) {
        document.getElementById('globalCopyright').value = savedCopyright;
        this.state.globalSettings.copyright = savedCopyright;
      }
      if (savedWebsite) {
        document.getElementById('globalWebsiteUrl').value = savedWebsite;
        this.state.globalSettings.websiteUrl = savedWebsite;
      }
      if (savedRating !== null) {
        const isOn = savedRating !== '0';
        document.getElementById('autoRatingToggle').checked = isOn;
        this.state.globalSettings.autoRating = isOn;
      }
    } catch(ex) {}

    // Save author/copyright/website to localStorage on change
    document.getElementById('globalAuthor').addEventListener('change', (e) => {
      try { localStorage.setItem('geotag_author', e.target.value); } catch(ex) {}
    });
    document.getElementById('globalCopyright').addEventListener('change', (e) => {
      try { localStorage.setItem('geotag_copyright', e.target.value); } catch(ex) {}
    });
    document.getElementById('globalWebsiteUrl').addEventListener('change', (e) => {
      try { localStorage.setItem('geotag_website_url', e.target.value.trim()); } catch(ex) {}
    });

    // Apply global settings
    document.getElementById('btnApplyGlobal').addEventListener('click', () => {
      this.applyGlobalSettings();
    });
  },

  /**
   * Apply author & copyright to all images
   */
  applyGlobalSettings() {
    const author = this.state.globalSettings.author;
    const copyright = this.state.globalSettings.copyright;
    const websiteUrl = this.state.globalSettings.websiteUrl;
    const autoRating = this.state.globalSettings.autoRating;

    if (!author && !copyright && !websiteUrl) {
      this.showToast('Chưa nhập Author, Copyright hoặc Website URL', 'warning');
      return;
    }

    this.state.images.forEach(img => {
      if (author) img.metadata.author = author;
      if (copyright) img.metadata.copyright = copyright;
      if (autoRating) img.metadata.rating = 5;
    });

    // Add website domain to tags if URL provided
    if (websiteUrl) {
      SmartTagGenerator.addWebsiteTags(this.state.images, websiteUrl);
    }

    // Refresh form if image selected
    if (this.state.selectedId) {
      this.selectImage(this.state.selectedId);
    }

    this.showToast(`✅ Đã áp dụng cho ${this.state.images.length} ảnh`, 'success');
  },

  // ==================== ACTION EVENTS ====================
  bindActionEvents() {
    // AI Tags button
    document.getElementById('btnAiTags').addEventListener('click', () => {
      this.processAITags();
    });

    // Write metadata (preview/confirm)
    document.getElementById('btnWriteMeta').addEventListener('click', () => {
      this.writeAllMetadata();
    });

    // Download ZIP
    document.getElementById('btnDownloadZip').addEventListener('click', () => {
      this.downloadAll();
    });

    // Clear all
    document.getElementById('btnClearAll').addEventListener('click', () => {
      this.clearAll();
    });

    // Select all
    document.getElementById('btnSelectAll').addEventListener('click', () => {
      // Just a visual helper - no multi-select needed for now
      if (this.state.images.length > 0) {
        this.selectImage(this.state.images[0].id);
      }
    });

    // Remove selected
    document.getElementById('btnRemoveSelected').addEventListener('click', () => {
      if (this.state.selectedId) {
        this.removeImage(this.state.selectedId);
      }
    });
  },

  // ==================== AI TAGS ====================
  async processAITags() {
    if (this.state.images.length === 0) {
      this.showToast('Chưa có ảnh nào', 'warning');
      return;
    }

    const btn = document.getElementById('btnAiTags');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Đang sinh tags...';
    this.showProgress(30, 'Đang sinh tags từ tên file...');

    // Step 1: ALWAYS use offline SmartTagGenerator (instant, no API)
    const count = SmartTagGenerator.processAll(this.state.images);
    console.log(`[SmartTags] ✅ Generated tags for ${count} images (offline)`);

    // Step 1b: Add website tags if URL is configured
    const websiteUrl = this.state.globalSettings.websiteUrl;
    if (websiteUrl) {
      SmartTagGenerator.addWebsiteTags(this.state.images, websiteUrl);
      console.log(`[SmartTags] ✅ Added website tags for: ${websiteUrl}`);
    }

    this.showProgress(60, `Đã sinh ${count} ảnh offline...`);

    // Step 2: TRY to enhance with Gemini API (optional)
    const apiKey = this.state.globalSettings.apiKey;
    let geminiSuccess = false;

    if (apiKey && this.state.globalSettings.aiMode) {
      this.showProgress(70, 'Đang nâng cấp bằng Gemini AI...');

      try {
        const topics = this.state.images.map(img => {
          const parsed = FilenameParser.parse(img.filename);
          return { filename: img.filename, title: parsed.title, tags: parsed.tags };
        });

        const aiResults = await this.callGeminiAPI(topics, apiKey);

        // Merge Gemini results ON TOP of offline results
        aiResults.forEach((result, i) => {
          if (i >= this.state.images.length) return;
          const img = this.state.images[i];

          // Add Gemini tags to existing (offline) tags
          if (result.tags && result.tags.length > 0) {
            const existingTags = img.metadata.tags
              ? img.metadata.tags.split(';').map(t => t.trim()).filter(Boolean)
              : [];
            const merged = [...new Set([...existingTags, ...result.tags.map(t => t.trim())])];
            img.metadata.tags = merged.join('; ');
          }

          // Gemini comment replaces offline comment (usually better quality)
          if (result.comment) {
            img.metadata.comment = result.comment;
          }
        });

        geminiSuccess = true;
        console.log('[Gemini] ✅ Enhanced with AI results');

      } catch (err) {
        console.warn('[Gemini] Skipped (using offline results):', err.message);
      }
    }

    // Refresh form
    if (this.state.selectedId) {
      this.selectImage(this.state.selectedId);
    }

    btn.disabled = false;
    btn.innerHTML = '🤖 AI Tags';
    this.hideProgress();

    if (geminiSuccess) {
      this.showToast(`✅ Đã sinh tags cho ${count} ảnh (Offline + Gemini AI)`, 'success');
    } else {
      this.showToast(`✅ Đã sinh tags cho ${count} ảnh (Offline)`, 'success');
    }
  },

  /**
   * Call Google Gemini API — ONE call for ALL images
   * Sends all filenames in a single prompt, receives tags+comment for each
   * @param {Array<{filename: string, title: string, tags: string[]}>} topics
   * @param {string} apiKey
   * @returns {Promise<Array<{tags: string[], comment: string}>>}
   */
  async callGeminiAPI(topics, apiKey) {
    const topicList = topics.map((t, i) => `${i + 1}. "${t.title}"`).join('\n');

    const prompt = `You are an SEO expert. I have ${topics.length} images with these topics:
${topicList}

For EACH image, generate:
- 10-15 SEO tags/keywords (main keywords, long-tail variations, related terms, synonyms)
- A natural description (50-80 words) for image alt text and SEO metadata

Return a JSON array with exactly ${topics.length} items:
[{"tags":["tag1","tag2"],"comment":"description"},{"tags":["tag1","tag2"],"comment":"description"}]

IMPORTANT: Return ONLY the JSON array. No markdown, no code blocks, no extra text.`;

    // Try multiple models
    const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
    let lastError = null;

    for (const model of models) {
      try {
        console.log(`[Gemini] Trying model: ${model}...`);
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048,
                responseMimeType: 'application/json'
              }
            })
          }
        );

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          const msg = err.error?.message || `API Error: ${response.status}`;
          if (response.status === 429 || msg.includes('quota') || msg.includes('rate') || msg.includes('exhausted')) {
            console.warn(`[Gemini] ${model}: quota exceeded, trying next...`);
            lastError = new Error(`${model}: Quota exceeded`);
            await this.sleep(2000);
            continue;
          }
          if (msg.includes('not found') || msg.includes('not supported')) {
            console.warn(`[Gemini] ${model}: not available, trying next...`);
            lastError = new Error(`${model}: not available`);
            continue;
          }
          throw new Error(msg);
        }

        const data = await response.json();
        console.log(`[Gemini] ✅ Success with model: ${model}`);
        return this._parseGeminiArrayResponse(data, topics.length);

      } catch (fetchErr) {
        if (fetchErr.message?.includes('quota') || fetchErr.message?.includes('rate') ||
            fetchErr.message?.includes('not found') || fetchErr.message?.includes('not available')) {
          lastError = fetchErr;
          continue;
        }
        throw fetchErr;
      }
    }

    throw lastError || new Error('Tất cả model đều hết quota. Vui lòng chờ 1 phút rồi thử lại.');
  },

  /**
   * Parse Gemini response expecting a JSON array of results
   */
  _parseGeminiArrayResponse(data, expectedCount) {
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini returned empty response');
    }

    try {
      const cleanText = text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

      const parsed = JSON.parse(cleanText);

      // Handle both array and single object
      const arr = Array.isArray(parsed) ? parsed : [parsed];

      // Ensure we have results for all images
      return arr.map(item => ({
        tags: Array.isArray(item?.tags) ? item.tags : [],
        comment: typeof item?.comment === 'string' ? item.comment : ''
      }));
    } catch (parseErr) {
      console.warn('[Gemini] JSON parse failed, trying manual extraction:', text.substring(0, 200));

      // Try to extract individual objects from text
      const results = [];
      const objRegex = /\{[^{}]*"tags"\s*:\s*\[[^\]]*\][^{}]*"comment"\s*:\s*"[^"]*"[^{}]*\}/g;
      let match;
      while ((match = objRegex.exec(text)) !== null) {
        try {
          const item = JSON.parse(match[0]);
          results.push({
            tags: Array.isArray(item.tags) ? item.tags : [],
            comment: typeof item.comment === 'string' ? item.comment : ''
          });
        } catch (e) { /* skip invalid */ }
      }

      if (results.length > 0) return results;

      // Last resort: return empty results
      return Array(expectedCount).fill({ tags: [], comment: '' });
    }
  },

  // ==================== WRITE METADATA ====================
  async writeAllMetadata() {
    if (this.state.images.length === 0) {
      this.showToast('Chưa có ảnh nào', 'warning');
      return;
    }

    let processed = 0;
    const total = this.state.images.length;

    this.showProgress(0, `Đang ghi metadata 0/${total}...`);

    // Process each image
    for (const img of this.state.images) {
      try {
        // Make sure we have the latest global settings
        if (!img.metadata.author && this.state.globalSettings.author) {
          img.metadata.author = this.state.globalSettings.author;
        }
        if (!img.metadata.copyright && this.state.globalSettings.copyright) {
          img.metadata.copyright = this.state.globalSettings.copyright;
        }
        // Auto 5-star rating
        if (this.state.globalSettings.autoRating && (!img.metadata.rating || img.metadata.rating < 5)) {
          img.metadata.rating = 5;
        }

        // Step 1: Strip ALL metadata via Canvas re-rendering
        // This removes EXIF + XMP + IPTC + Canva Program name + everything
        const cleanDataURL = await MetadataManager.stripAllMetadata(img.dataURL);

        // Step 2: Write fresh EXIF onto the clean image
        const newDataURL = MetadataManager.writeExif(cleanDataURL, img.metadata);
        img.dataURL = newDataURL;

        processed++;
        this.showProgress(
          Math.round((processed / total) * 100),
          `Đang ghi ${processed}/${total}...`
        );
      } catch (err) {
        console.error(`Error writing metadata for ${img.filename}:`, err);
      }
    }

    this.hideProgress();
    this.showToast(`✅ Đã ghi metadata cho ${processed}/${total} ảnh`, 'success');
  },

  // ==================== DOWNLOAD ====================
  async downloadAll() {
    if (this.state.images.length === 0) {
      this.showToast('Chưa có ảnh nào', 'warning');
      return;
    }

    const btn = document.getElementById('btnDownloadZip');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Đang xử lý...';

    try {
      await Downloader.downloadAll(
        this.state.images,
        (percent, message) => {
          this.showProgress(percent, message);
        }
      );

      this.showToast(`📥 Đã tải ${this.state.images.length} ảnh!`, 'success');
    } catch (err) {
      console.error('Download error:', err);
      this.showToast(`Lỗi tải xuống: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '📥 Tải ZIP';
      setTimeout(() => this.hideProgress(), 2000);
    }
  },

  // ==================== CLEAR ALL ====================
  clearAll() {
    if (this.state.images.length === 0) return;

    if (!confirm(`Xóa tất cả ${this.state.images.length} ảnh?`)) return;

    this.state.images = [];
    this.state.selectedId = null;

    GeoTagger.clearAll();
    this.clearForm();
    this.renderImageGrid();
    this.updateStats();
    this.updateButtonStates();

    document.getElementById('dropZone').classList.remove('compact');
    this.showToast('🗑️ Đã xóa tất cả ảnh', 'info');
  },

  // ==================== HELPERS ====================
  getImageById(id) {
    return this.state.images.find(img => img.id === id);
  },

  getSelectedImage() {
    return this.state.selectedId ? this.getImageById(this.state.selectedId) : null;
  },

  generateId() {
    return 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  },

  truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen - 2) + '…' : str;
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // ==================== UI UPDATES ====================
  updateStats() {
    const total = this.state.images.length;
    const geotagged = this.state.images.filter(img => img.metadata.gps).length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statGeotagged').textContent = geotagged;
  },

  updateButtonStates() {
    const hasImages = this.state.images.length > 0;

    document.getElementById('btnWriteMeta').disabled = !hasImages;
    document.getElementById('btnDownloadZip').disabled = !hasImages;
    document.getElementById('btnClearAll').disabled = !hasImages;
    document.getElementById('btnAiTags').disabled = !hasImages;
  },

  showProgress(percent, text) {
    const container = document.getElementById('progressContainer');
    const fill = document.getElementById('progressFill');
    const textEl = document.getElementById('progressText');

    container.classList.remove('hidden');
    fill.style.width = percent + '%';
    textEl.textContent = text || '';
  },

  hideProgress() {
    const container = document.getElementById('progressContainer');
    container.classList.add('hidden');
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('progressText').textContent = '';
  },

  /**
   * Show a toast notification
   * @param {string} message
   * @param {string} type - 'success' | 'error' | 'warning' | 'info'
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    toast.innerHTML = `<span>${icons[type] || '📌'}</span><span>${message}</span>`;
    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }
};

// ==================== BOOT ====================
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
