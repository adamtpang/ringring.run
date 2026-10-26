"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef } from "react";
import type { LatLon, Place } from "@/lib/places/types";

// OpenStreetMap tiles through Leaflet. No API key. Loaded client-side only.

const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

function pinIcon(selected: boolean, hovered: boolean) {
  const size = selected ? 22 : hovered ? 18 : 14;
  return L.divIcon({
    className: "",
    html: `<span class="rr-pin${selected ? " is-selected" : hovered ? " is-hovered" : ""}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export interface PlacesMapProps {
  center: LatLon;
  radiusM: number;
  places: Place[];
  selectedId: string | null;
  hoveredId: string | null;
  showUser: boolean;
  onSelect: (id: string) => void;
  /** Extra bottom padding (px) so a mobile bottom sheet does not cover the selected pin. */
  bottomInset?: number;
}

export default function PlacesMap({ center, radiusM, places, selectedId, hoveredId, showUser, onSelect, bottomInset = 0 }: PlacesMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const area = useRef<L.Circle | null>(null);
  const user = useRef<L.CircleMarker | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const onSelectRef = useRef(onSelect);
  const insetRef = useRef(bottomInset);
  const placesRef = useRef(places);

  /** Frame the results above the bottom sheet. */
  const fit = useCallback(() => {
    const m = map.current;
    const ps = placesRef.current;
    if (!m || ps.length === 0) return;
    m.fitBounds(L.latLngBounds(ps.map((p) => [p.lat, p.lon] as [number, number])), {
      paddingTopLeft: [40, 40],
      paddingBottomRight: [40, 40 + insetRef.current],
      maxZoom: 16,
    });
  }, []);

  // The sheet height is known only after mount on phones; reframe when it changes and nothing is selected.
  useEffect(() => {
    insetRef.current = bottomInset;
    if (!selectedId) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottomInset, fit]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  // Create the map once.
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lon], 15);
    L.control.zoom({ position: "topright" }).addTo(m);
    m.attributionControl.setPrefix(false);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search area and user dot follow the center.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    // Keep framing the results if they already belong to this center; otherwise jump to it until they arrive.
    const c = L.latLng(center.lat, center.lon);
    const near = placesRef.current.length > 0 && placesRef.current.every((p) => c.distanceTo([p.lat, p.lon]) <= radiusM * 1.5);
    if (near) fit();
    else m.setView(c, radiusM > 1500 ? 14 : 15);
    area.current?.remove();
    area.current = L.circle([center.lat, center.lon], {
      radius: radiusM,
      color: "#0071e3",
      weight: 1,
      opacity: 0.35,
      fillOpacity: 0.03,
      interactive: false,
    }).addTo(m);
    user.current?.remove();
    user.current = showUser
      ? L.circleMarker([center.lat, center.lon], { radius: 7, color: "#fff", weight: 3, fillColor: "#0071e3", fillOpacity: 1, interactive: false }).addTo(m)
      : null;
  }, [center.lat, center.lon, radiusM, showUser, fit]);

  // Markers for the result set.
  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    markers.current.clear();
    for (const p of places) {
      const mk = L.marker([p.lat, p.lon], { icon: pinIcon(false, false), title: p.name, alt: p.name, keyboard: true, riseOnHover: true });
      mk.on("click", () => onSelectRef.current(p.id));
      mk.on("keypress", (e: L.LeafletKeyboardEvent) => {
        if (e.originalEvent.key === "Enter" || e.originalEvent.key === " ") onSelectRef.current(p.id);
      });
      mk.addTo(g);
      markers.current.set(p.id, mk);
    }
    placesRef.current = places;
    fit();
  }, [places, fit]);

  // Highlight the selected and hovered pins, and bring the selected one into view.
  useEffect(() => {
    for (const [id, mk] of markers.current) {
      mk.setIcon(pinIcon(id === selectedId, id === hoveredId));
      mk.setZIndexOffset(id === selectedId ? 1000 : id === hoveredId ? 500 : 0);
    }
    const sel = selectedId ? markers.current.get(selectedId) : null;
    const m = map.current;
    if (sel && m) m.panInside(sel.getLatLng(), { paddingTopLeft: [40, 40], paddingBottomRight: [40, 40 + bottomInset] });
  }, [selectedId, hoveredId, places, bottomInset]);

  return <div ref={el} className="h-full w-full bg-surface-2" role="region" aria-label="Map of results" />;
}
