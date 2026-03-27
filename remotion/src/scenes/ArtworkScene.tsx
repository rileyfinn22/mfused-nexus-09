import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { FeatureLabel } from "../components/FeatureLabel";

export const ArtworkScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const screenSpring = spring({ frame: frame - 10, fps, config: { damping: 20, stiffness: 150 } });
  const screenScale = interpolate(screenSpring, [0, 1], [0.92, 1]);
  const drift = interpolate(frame, [0, 230], [0, -15]);
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 80 }}>
        <div style={{ flex: 1, opacity: screenSpring, transform: `scale(${screenScale}) translateY(${drift}px)` }}>
          <ScreenFrame src="images/real-artwork-library.png" width={1200} />
        </div>
        <div style={{ width: 420, flexShrink: 0 }}>
          <FeatureLabel text="Artwork & Proofs" subtitle="Browse your templates, review flat proofs, and approve artwork — all in one place. Version history keeps every revision tracked." delay={5} />
          <div style={{ display: "flex", gap: 30, marginTop: 30 }}>
            {[{ n: "339", label: "Total Files" }, { n: "207", label: "Approved" }, { n: "54", label: "Templates" }].map((s, i) => {
              const sp = spring({ frame: frame - 25 - i * 6, fps, config: { damping: 20 } });
              return (
                <div key={s.label} style={{ opacity: sp, transform: `translateY(${interpolate(sp, [0, 1], [15, 0])}px)` }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: "#22c55e", fontFamily: "sans-serif" }}>{s.n}</div>
                  <div style={{ fontSize: 13, color: "rgba(148,163,184,0.6)", fontFamily: "sans-serif" }}>{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
