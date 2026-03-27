import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { FeatureLabel } from "../components/FeatureLabel";

export const ShipmentScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const screenSpring = spring({ frame: frame - 10, fps, config: { damping: 20, stiffness: 150 } });
  const screenScale = interpolate(screenSpring, [0, 1], [0.92, 1]);
  const drift = interpolate(frame, [0, 210], [5, -12]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 50 }}>
        {/* Left label */}
        <div style={{ width: 380, flexShrink: 0 }}>
          <FeatureLabel
            text="Shipment Tracking"
            subtitle="Multi-leg tracking from factory to doorstep. Live carrier updates, customs status, and delivery ETAs."
            delay={5}
          />

          {/* Status pills */}
          <div style={{ display: "flex", gap: 10, marginTop: 30, flexWrap: "wrap" }}>
            {["International", "Customs", "Domestic"].map((pill, i) => {
              const pillSpring = spring({ frame: frame - 30 - i * 6, fps, config: { damping: 20 } });
              return (
                <div
                  key={pill}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 20,
                    background: "rgba(184,207,104,0.15)",
                    border: "1px solid rgba(184,207,104,0.3)",
                    color: "#b8cf68",
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

        {/* Right screenshot - contained */}
        <div
          style={{
            flex: 1,
            opacity: screenSpring,
            transform: `scale(${screenScale}) translateY(${drift}px)`,
          }}
        >
          <ScreenFrame src="images/shipment-tracking-world.jpg" width={1300} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
