(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const mapContainer = document.getElementById('province-map');
    if (!mapContainer) return;
    if (typeof L === 'undefined') {
      console.warn('[LOCATIONS] Leaflet library is not loaded.');
      return;
    }

    const data = Array.isArray(window.LOC_PROVINCE_DATA) ? window.LOC_PROVINCE_DATA : [];
    const hasCoords = data.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
    const defaultCenter = hasCoords.length
      ? [hasCoords[0].latitude, hasCoords[0].longitude]
      : [13.7563, 100.5018];
    const mapboxToken = String(mapContainer.dataset.mapboxToken || '').trim();
    const useMapbox = mapboxToken.length > 0;

    const map = L.map(mapContainer, {
      center: defaultCenter,
      zoom: 6,
      scrollWheelZoom: false,
    });

    if (map.attributionControl) {
      map.attributionControl.setPrefix('');
    }

    if (useMapbox) {
      L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/512/{z}/{x}/{y}@2x?access_token=${mapboxToken}`,
        {
          maxZoom: 18,
          tileSize: 512,
          zoomOffset: -1,
          attribution: '© Mapbox © OpenStreetMap',
        }
      ).addTo(map);
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);
    }

    const bounds = [];
    hasCoords.forEach((item) => {
      const radius = Math.max(8, Math.sqrt(item.count) * 4);
      const circle = L.circleMarker([item.latitude, item.longitude], {
        radius,
        color: '#2563eb',
        weight: 1.2,
        fillColor: '#3b82f6',
        fillOpacity: 0.55,
      });
      circle.bindPopup(`<strong>${item.province}</strong><br/>${item.count.toLocaleString('th-TH')} ครั้ง`);
      circle.addTo(map);
      bounds.push([item.latitude, item.longitude]);
    });

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  });
})();
