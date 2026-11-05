import { ImageResponse } from "next/og";

export const alt = "Clinical Trial Matcher — search four public trial registries with your clinical notes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#0f172a",
          color: "#f8fafc",
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 700 }}>Clinical Trial Matcher</div>
        <div style={{ fontSize: 34, marginTop: 24, color: "#cbd5e1" }}>
          ClinicalTrials.gov · EU CTR · WHO ICTRP · ISRCTN
        </div>
        <div style={{ fontSize: 28, marginTop: 40, color: "#94a3b8" }}>
          Paste clinical notes. Get ranked recruiting studies with eligibility checks.
        </div>
      </div>
    ),
    size
  );
}
