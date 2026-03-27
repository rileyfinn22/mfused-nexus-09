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
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 40px" }}>
      {/* Label on top - compact */}
      <div style={{ marginBottom: 20 }}>
        <FeatureLabel text="Production Visibility" subtitle="Know exactly where your order is. Real-time progress from material prep through QC." delay={5} />
      </div>
      {/* Screenshots below - BIGGER, wider overlap */}
      <div style={{ position: "relative", width: "100%", height: 600 }}>
        <div style={{ position: "absolute", top: 0, left: 0, opacity: screen1Spring, transform: `scale(${interpolate(screen1Spring, [0, 1], [0.95, 1])}) translateY(${drift}px)` }}>
          <ScreenFrame src="images/real-production-overview.png" width={1050} />
        </div>
        <div style={{ position: "absolute", top: 50, left: 750, opacity: screen2Spring, transform: `scale(${interpolate(screen2Spring, [0, 1], [0.95, 1])}) translateY(${drift * 0.6}px)`, zIndex: 2 }}>
          <ScreenFrame src="images/real-production-stages.png" width={1050} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
