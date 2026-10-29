"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Fit } from "@/lib/walk";

const COLOR: Record<Fit, string> = { green: "#60d394", amber: "#ffd97d", red: "#ee6055" };

export interface MapPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  fit: Fit;
}

function icon(fit: Fit, on: boolean) {
  const size = on ? 18 : 14;
  const color = COLOR[fit];
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span title="" style="display:block;width:${size}px;height:${size}px;border-radius:999px;background:${color};box-shadow:0 0 0 ${on ? 3 : 1}px #1d1d1f"></span>`,
  });
}

export default function WalkMap({
  center,
  pins,
  selectedId,
  onSelect,
}: {
  center: { lat: number; lng: number };
  pins: MapPin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lng], 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // Map is created once. Center updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map.current?.setView([center.lat, center.lng], map.current.getZoom());
  }, [center.lat, center.lng]);

  useEffect(() => {
    const group = layer.current;
    if (!group) return;
    group.clearLayers();
    for (const pin of pins) {
      const marker = L.marker([pin.lat, pin.lng], { icon: icon(pin.fit, pin.id === selectedId), title: pin.name, keyboard: true });
      marker.on("click", () => onSelectRef.current(pin.id));
      marker.addTo(group);
    }
  }, [pins, selectedId]);

  return <div ref={el} className="h-full w-full" role="application" aria-label="Map of nearby businesses" />;
}
