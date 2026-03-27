import { Img, staticFile } from "remotion";

interface ScreenFrameProps {
  src: string;
  width?: number;
  style?: React.CSSProperties;
}

export const ScreenFrame = ({ src, width = 1400, style }: ScreenFrameProps) => {
  const borderRadius = 12;
  const titleBarHeight = 36;

  return (
    <div
      style={{
        width,
        borderRadius,
        overflow: "hidden",
        boxShadow: "0 25px 80px rgba(0,0,0,0.6), 0 0 40px rgba(59,130,246,0.15)",
        border: "1px solid rgba(255,255,255,0.08)",
        ...style,
      }}
    >
      {/* Title bar */}
      <div
        style={{
          height: titleBarHeight,
          background: "linear-gradient(180deg, #2a2a3a 0%, #1e1e2e 100%)",
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          gap: 8,
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
        <div style={{ flex: 1, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13, fontFamily: "sans-serif" }}>
          VibePKG Portal
        </div>
      </div>
      {/* Screenshot */}
      <Img
        src={staticFile(src)}
        style={{ width: "100%", display: "block" }}
      />
    </div>
  );
};
