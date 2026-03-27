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
        {/* Left screenshot - large */}
        <div
          style={{
            flex: 1,
            opacity: screenSpring,
            transform: `scale(${screenScale}) translateY(${drift}px)`,
          }}
        >
          <ScreenFrame src="images/shipment-tracking-world.jpg" width={1400} />
        </div>

        {/* Right label */}
        <div style={{ width: 380, flexShrink: 0 }}>
          <FeatureLabel
            text="Shipment Tracking"
            subtitle="Track your shipment from factory to doorstep. Live updates with carrier info, customs status, and delivery ETAs."
            delay={5}
          />

          {/* Flow steps */}
          <div style={{ marginTop: 35 }}>
            {["Departed Factory", "Customs Cleared", "Arrived Port", "Out for Delivery"].map((step, i) => {
              const sp = spring({ frame: frame - 25 - i * 7, fps, config: { damping: 20 } });
              return (
                <div
                  key={step}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 12,
                    opacity: sp,
                    transform: `translateX(${interpolate(sp, [0, 1], [-20, 0])}px)`,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: i < 3 ? "#22c55e" : "rgba(59,130,246,0.3)",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "white",
                      fontFamily: "sans-serif",
                    }}
                  >
                    {i < 3 ? "✓" : (i + 1)}
                  </div>
                  <span style={{ fontSize: 17, color: "rgba(255,255,255,0.85)", fontFamily: "sans-serif", fontWeight: 500 }}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
