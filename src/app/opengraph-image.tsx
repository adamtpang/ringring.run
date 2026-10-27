import { ImageResponse } from "next/og";

export const alt = "ringring.run: every missed call, found and priced";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HANDSET =
  "M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#fbfbfd", color: "#1d1d1f", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 0 0 88px", width: 760 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 36, fontWeight: 600, letterSpacing: -0.5 }}>
            <svg width="48" height="48" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="14.75" fill="none" stroke="#60d394" strokeWidth="2.5" opacity="0.32" />
              <circle cx="16" cy="16" r="10.5" fill="#60d394" />
              <path d={HANDSET} fill="white" transform="translate(9.4 9.4) scale(0.55)" />
            </svg>
            <span>
              ringring<span style={{ color: "#8e8e93" }}>.run</span>
            </span>
          </div>
          <div style={{ marginTop: 44, fontSize: 80, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2.5 }}>Every missed call,</div>
          <div style={{ fontSize: 80, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2.5, color: "#6e6e73" }}>found and priced.</div>
          <div style={{ marginTop: 36, fontSize: 28, color: "#6e6e73" }}>AI voice agent for small businesses.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <svg width="400" height="400" viewBox="0 0 400 400">
            <circle cx="200" cy="200" r="190" fill="none" stroke="#60d394" strokeWidth="2" opacity="0.12" />
            <circle cx="200" cy="200" r="150" fill="none" stroke="#60d394" strokeWidth="2" opacity="0.22" />
            <circle cx="200" cy="200" r="110" fill="#60d394" opacity="0.08" />
            <circle cx="200" cy="200" r="76" fill="#60d394" />
            <path d={HANDSET} fill="white" transform="translate(167 167) scale(2.75)" />
          </svg>
        </div>
      </div>
    ),
    size,
  );
}
