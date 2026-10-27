import qrcode from "qrcode-generator";

/** A QR code drawn as one SVG path, so it stays sharp in print. */
export function Qr({ value, size = 96, label }: { value: string; size?: number; label: string }) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  const dim = n + quiet * 2;
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${dim} ${dim}`} shapeRendering="crispEdges">
      <rect width={dim} height={dim} fill="#ffffff" />
      <path d={d} fill="#1d1d1f" />
    </svg>
  );
}
