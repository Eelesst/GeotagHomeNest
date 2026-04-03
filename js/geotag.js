/**
 * GeoTagger - Interactive map for geotagging images using Leaflet + OpenStreetMap
 * 
 * Features:
 * - Click on map to set GPS coordinates
 * - Draggable marker
 * - Address search via Nominatim
 * - Manual coordinate input
 * - Multiple markers for batch view
 */
const GeoTagger = {
  map: null,
  marker: null,
  imageMarkers: new Map(), // imageId → L.marker
  selectedCoords: null,
  onCoordsChange: null, // callback(coords)

  /**
   * Initialize the Leaflet map
   * @param {string} containerId - DOM element ID for the map
   */
  init(containerId) {
    // Default center: Vietnam
    this.map = L.map(containerId, {
      zoomControl: true,
      attributionControl: true
    }).setView([16.0, 106.0], 6);

    // OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(this.map);

    // Click handler
    this.map.on('click', (e) => {
      this.setCoords(e.latlng.lat, e.latlng.lng);
    });
  },

  /**
   * Set coordinates and place/move the active marker
   * @param {number} lat
   * @param {number} lng
   */
  setCoords(lat, lng) {
    lat = parseFloat(lat);
    lng = parseFloat(lng);
    if (isNaN(lat) || isNaN(lng)) return;

    this.selectedCoords = { lat, lng };

    // Create or move marker
    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      this.marker = L.marker([lat, lng], {
        draggable: true,
        icon: this._createIcon('#00d4ff', '📍')
      }).addTo(this.map);

      this.marker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        this.selectedCoords = { lat: pos.lat, lng: pos.lng };
        if (this.onCoordsChange) {
          this.onCoordsChange(this.selectedCoords);
        }
      });
    }

    // Pan to marker with appropriate zoom
    const currentZoom = this.map.getZoom();
    this.map.setView([lat, lng], Math.max(currentZoom, 13), { animate: true });

    // Fire callback
    if (this.onCoordsChange) {
      this.onCoordsChange(this.selectedCoords);
    }
  },

  /**
   * Search for an address using Nominatim geocoding
   * @param {string} query
   * @returns {Promise<Array>} Search results
   */
  async searchAddress(query) {
    if (!query || query.trim().length < 2) return [];

    try {
      const url = `https://nominatim.openstreetmap.org/search?` +
        `format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=vi`;

      const response = await fetch(url, {
        headers: { 'User-Agent': 'ImageGeoTagTool/1.0' }
      });

      if (!response.ok) throw new Error('Nominatim request failed');

      return await response.json();
    } catch (e) {
      console.error('Search error:', e);
      return [];
    }
  },

  /**
   * Add a small marker for an image with GPS
   * @param {string} imageId
   * @param {number} lat
   * @param {number} lng
   * @param {string} label
   */
  addImageMarker(imageId, lat, lng, label) {
    // Remove existing marker for this image
    this.removeImageMarker(imageId);

    const marker = L.marker([lat, lng], {
      icon: this._createSmallIcon(),
      title: label
    }).addTo(this.map);

    marker.bindPopup(`<b>${label}</b><br>📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    this.imageMarkers.set(imageId, marker);
  },

  /**
   * Remove a marker for an image
   * @param {string} imageId
   */
  removeImageMarker(imageId) {
    if (this.imageMarkers.has(imageId)) {
      this.map.removeLayer(this.imageMarkers.get(imageId));
      this.imageMarkers.delete(imageId);
    }
  },

  /**
   * Get current selected coordinates
   * @returns {Object|null} { lat, lng }
   */
  getCoords() {
    return this.selectedCoords;
  },

  /**
   * Clear the active selection marker
   */
  clearMarker() {
    if (this.marker) {
      this.map.removeLayer(this.marker);
      this.marker = null;
    }
    this.selectedCoords = null;
  },

  /**
   * Clear all markers
   */
  clearAll() {
    this.clearMarker();
    this.imageMarkers.forEach(marker => {
      this.map.removeLayer(marker);
    });
    this.imageMarkers.clear();
  },

  /**
   * Force map to recalculate size (call after container resize)
   */
  invalidateSize() {
    if (this.map) {
      setTimeout(() => this.map.invalidateSize(), 100);
    }
  },

  /**
   * Create a custom colored icon
   * @private
   */
  _createIcon(color, emoji) {
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        background: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
      "><span style="transform: rotate(45deg); font-size: 14px;">${emoji || ''}</span></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });
  },

  /**
   * Create a small marker for image indicators
   * @private
   */
  _createSmallIcon() {
    return L.divIcon({
      className: 'image-marker',
      html: `<div style="
        background: #ff6b6b;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });
  }
};
