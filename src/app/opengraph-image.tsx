import { ImageResponse } from "next/og";

export const alt = "ringring.run: AI that picks up every call";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#fbfbfd",
          color: "#1d1d1f",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 600 }}>
          <div style={{ width: 48, height: 48, borderRadius: 48, border: "8px solid #0071e3" }} />
          ringring.run
        </div>
        <div style={{ marginTop: 40, fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>Every call answered.</div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, color: "#6e6e73" }}>Every leak priced.</div>
        <div style={{ marginTop: 36, fontSize: 30, color: "#6e6e73" }}>
          AI that picks up every call and finds where AI saves the business money.
        </div>
      </div>
    ),
    size,
  );
}
