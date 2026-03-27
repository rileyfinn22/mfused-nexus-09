import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { FeatureLabel } from "../components/FeatureLabel";

export const ProductionScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const screen1Spring = spring({ frame: frame - 8, fps, config: { damping: 20, stiffness: 150 } });
  const screen2Spring = spring({ frame: frame - 22, fps, config: { damping: 20, stiffness: 150 } });
  const drift = interpolate(frame, [0, 280], [10, -15]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 50px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        {/* Left: stacked screenshots - larger and better positioned */}
        <div style={{ position: "relative", width: 1050, height: 720, flexShrink: 0 }}>
          <div style={{ position: "absolute", top: 0, left: 0, opacity: screen1Spring, transform: `scale(${interpolate(screen1Spring, [0, 1], [0.95, 1])}) translateY(${drift}px)` }}>
            <ScreenFrame src="images/real-production-overview.png" width={980} />
          </div>
          <div style={{ position: "absolute", top: 260, left: 320, opacity: screen2Spring, transform: `scale(${interpolate(screen2Spring, [0, 1], [0.95, 1])}) translateY(${drift * 0.6}px)`, zIndex: 2 }}>
            <ScreenFrame src="images/real-production-stages.png" width={780} />
          </div>
        </div>
        {/* Right: label */}
        <div style={{ flex: 1, minWidth: 300 }}>
          <FeatureLabel text="Production Visibility" subtitle="Know exactly where your order is. Real-time progress from material prep through QC — no guesswork, no surprises." delay={5} />
          <div style={{ display: "flex", gap: 10, marginTop: 30, flexWrap: "wrap" }}>
            {["Live Progress", "Stage Details", "Timeline View", "Delivery ETA"].map((pill, i) => {
              const pillSpring = spring({ frame: frame - 30 - i * 6, fps, config: { damping: 20 } });
              return (
                <div key={pill} style={{ padding: "8px 18px", borderRadius: 20, background: "rgba(184,207,104,0.15)", border: "1px solid rgba(184,207,104,0.3)", color: "#b8cf68", fontSize: 15, fontWeight: 600, fontFamily: "sans-serif", opacity: pillSpring, transform: `translateY(${interpolate(pillSpring, [0, 1], [15, 0])}px)` }}>{pill}</div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
