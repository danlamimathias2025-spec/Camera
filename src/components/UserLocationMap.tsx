import React, { useEffect, useRef } from 'react';
import { OnlineUser } from '../types';
import L from 'leaflet';

interface UserLocationMapProps {
  onlineUsers: OnlineUser[];
  onSelectUser: (user: OnlineUser) => void;
}

export const UserLocationMap: React.FC<UserLocationMapProps> = ({ onlineUsers, onSelectUser }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);

  // Inject Leaflet CSS dynamically if not present
  useEffect(() => {
    const leafletCssId = 'leaflet-css-cdn';
    if (!document.getElementById(leafletCssId)) {
      const link = document.createElement('link');
      link.id = leafletCssId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Default initial view: global view centered
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false
      }).setView([20, 0], 2);

      // Dark theme map tile layer (CartoDB Dark Matter)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(map);

      const markersGroup = L.layerGroup().addTo(map);
      markersGroupRef.current = markersGroup;
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Markers on onlineUsers change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    const bounds: L.LatLngBounds = L.latLngBounds([]);
    let hasValidCoords = false;

    onlineUsers.forEach((user) => {
      if (!user.location?.lat || !user.location?.lng) return;

      const { lat, lng, city, country } = user.location;
      bounds.extend([lat, lng]);
      hasValidCoords = true;

      // Custom animated SVG pulse pin marker
      const isLive = user.isStreaming;
      const markerHtml = `
        <div class="relative group cursor-pointer">
          <div class="w-7 h-7 rounded-full ${isLive ? 'bg-indigo-600 border-2 border-white shadow-[0_0_15px_#6366f1]' : 'bg-slate-700 border border-slate-400'} flex items-center justify-center text-white font-bold text-xs shadow-xl transition-transform hover:scale-125">
            ${user.name.charAt(0).toUpperCase()}
          </div>
          ${isLive ? '<div class="absolute -inset-1 rounded-full bg-indigo-500/50 animate-ping pointer-events-none"></div>' : ''}
        </div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-user-pin',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      const telemetry = user.telemetry;
      const popupContent = `
        <div style="font-family: system-ui, sans-serif; color: #f8fafc; min-width: 200px;">
          <div style="display: flex; items-center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <strong style="font-size: 13px; color: #ffffff;">${user.name}</strong>
            <span style="font-size: 10px; padding: 2px 6px; border-radius: 999px; background: ${isLive ? '#10b98120' : '#47556940'}; color: ${isLive ? '#34d399' : '#94a3b8'}; border: 1px solid ${isLive ? '#10b98140' : '#47556960'}; font-weight: bold;">
              ${isLive ? 'LIVE' : 'IDLE'}
            </span>
          </div>
          <div style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">
            ${city || 'Location'} ${country ? `• ${country}` : ''}
          </div>
          ${telemetry ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px; font-family: monospace; background: #0f172a; padding: 6px; border-radius: 8px; margin-bottom: 8px;">
              <div>Latency: <b style="color: #6366f1;">${telemetry.latencyMs}ms</b></div>
              <div>FPS: <b style="color: #34d399;">${telemetry.fps}</b></div>
              <div>Res: <b style="color: #fbbf24;">${telemetry.resolution}</b></div>
              <div>Loss: <b style="color: #f87171;">${telemetry.packetLossPercent}%</b></div>
            </div>
          ` : ''}
          <button
            id="map-view-user-${user.userId}"
            style="width: 100%; padding: 6px 12px; background: #4f46e5; border: none; border-radius: 8px; color: white; font-size: 11px; font-weight: 600; cursor: pointer; text-align: center;"
          >
            Open Live Camera View
          </button>
        </div>
      `;

      marker.bindPopup(popupContent, {
        className: 'leaflet-dark-popup'
      });

      marker.on('popupopen', () => {
        setTimeout(() => {
          const btn = document.getElementById(`map-view-user-${user.userId}`);
          if (btn) {
            btn.onclick = () => onSelectUser(user);
          }
        }, 50);
      });

      markersGroup.addLayer(marker);
    });

    if (hasValidCoords && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [onlineUsers, onSelectUser]);

  return (
    <div className="relative w-full h-[360px] rounded-2xl overflow-hidden border border-slate-800 shadow-xl bg-slate-950">
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Map Legend Overlay */}
      <div className="absolute bottom-3 left-3 z-20 px-3 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-800 text-[11px] text-slate-300 flex items-center gap-3 pointer-events-none shadow-lg">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 ring-2 ring-indigo-400/50 animate-pulse" />
          <span>Active Camera</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
          <span>Idle Camera</span>
        </div>
      </div>
    </div>
  );
};
