(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('[data-province-map]');
    if (!cards.length) return;
    if (typeof L === 'undefined') {
      console.warn('[DASHBOARD] Leaflet library is missing, province map skipped.');
      return;
    }

    cards.forEach((card) => {
      const canvas = card.querySelector('[data-map-canvas]');
      if (!canvas) return;

      const payload = card.dataset.mapPayload || '[]';
      let data = [];
      try {
        data = JSON.parse(payload);
      } catch (err) {
        console.warn('[DASHBOARD] province map payload parse error', err);
        data = [];
      }

      if (!Array.isArray(data)) data = [];

      const provincesWithCoords = data.filter((item) =>
        Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude)
      );

      const defaultCenter = provincesWithCoords.length
        ? [provincesWithCoords[0].latitude, provincesWithCoords[0].longitude]
        : [15.1235, 101.0021];
      const mapboxToken = String(card.dataset.mapboxToken || '').trim();
      const useMapbox = mapboxToken.length > 0;

      const map = L.map(canvas, {
        center: defaultCenter,
        zoom: 5.6,
        zoomControl: false,
        attributionControl: true,
        dragging: false,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false,
        touchZoom: false,
      });

      if (map.attributionControl) {
        map.attributionControl.setPrefix('');
      }

      if (useMapbox) {
        L.tileLayer(
          `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/512/{z}/{x}/{y}@2x?access_token=${mapboxToken}`,
          {
            maxZoom: 18,
            tileSize: 512,
            zoomOffset: -1,
            attribution: '© Mapbox © OpenStreetMap',
          }
        ).addTo(map);
      } else {
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 18,
          subdomains: 'abcd',
          attribution: '© OpenStreetMap contributors © CARTO',
        }).addTo(map);
      }

      const bounds = [];
      provincesWithCoords.forEach((item) => {
        const base = Math.log((item.count || 0) + 1);
        const radius = Math.max(10, base * 8);

        const marker = L.circleMarker([item.latitude, item.longitude], {
          radius,
          weight: 1.2,
          color: '#fb7185',
          opacity: 0.85,
          fillColor: '#f97316',
          fillOpacity: 0.55,
          className: 'province-bubble',
        });

        marker.bindTooltip(
          `<strong>${item.province || 'ไม่ทราบจังหวัด'}</strong><br/>` +
            `${Number(item.count || 0).toLocaleString('th-TH')} ครั้ง`,
          { direction: 'top' }
        );
        marker.addTo(map);

        const haloRadius = Math.max(2500, radius * 1600);
        L.circle([item.latitude, item.longitude], {
          radius: haloRadius,
          stroke: false,
          fillColor: '#f97316',
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(map);

        bounds.push([item.latitude, item.longitude]);
      });

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [30, 30] });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 7);
      }
    });
  });
})();
