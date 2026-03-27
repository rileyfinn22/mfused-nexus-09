import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Sequence } from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { FeatureLabel } from "../components/FeatureLabel";

export const ProductionScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Two screenshots stacked with stagger
  const screen1Spring = spring({ frame: frame - 8, fps, config: { damping: 20, stiffness: 150 } });
  const screen2Spring = spring({ frame: frame - 20, fps, config: { damping: 20, stiffness: 150 } });

  const drift = interpolate(frame, [0, 120], [10, -10]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 60 }}>
        {/* Screenshots stacked */}
        <div style={{ position: "relative", width: 900, height: 700, flexShrink: 0 }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              opacity: screen1Spring,
              transform: `scale(${interpolate(screen1Spring, [0, 1], [0.95, 1])}) translateY(${drift}px)`,
            }}
          >
            <ScreenFrame src="images/production-overview.png" width={850} />
          </div>
          <div
            style={{
              position: "absolute",
              top: 180,
              left: 280,
              opacity: screen2Spring,
              transform: `scale(${interpolate(screen2Spring, [0, 1], [0.95, 1])}) translateY(${drift * 0.6}px)`,
              zIndex: 2,
            }}
          >
            <ScreenFrame src="images/production-stages.png" width={700} />
          </div>
        </div>

        {/* Right label */}
        <div style={{ flex: 1 }}>
          <FeatureLabel
            text="Production Tracking"
            subtitle="12-stage pipeline from estimate to delivery. Vendor updates, substage progress, admin-moderated publishing for customer visibility."
            delay={5}
          />

          {/* Feature pills */}
          <div style={{ display: "flex", gap: 10, marginTop: 30, flexWrap: "wrap" }}>
            {["Vendor Updates", "Admin Review", "Customer View", "Substages"].map((pill, i) => {
              const pillSpring = spring({ frame: frame - 30 - i * 6, fps, config: { damping: 20 } });
              return (
                <div
                  key={pill}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 20,
                    background: "rgba(59,130,246,0.15)",
                    border: "1px solid rgba(59,130,246,0.3)",
                    color: "#60a5fa",
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: "sans-serif",
                    opacity: pillSpring,
                    transform: `translateY(${interpolate(pillSpring, [0, 1], [15, 0])}px)`,
                  }}
                >
                  {pill}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
