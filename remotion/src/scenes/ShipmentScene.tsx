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
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 50px" }}>
      {/* Label on top */}
      <div style={{ marginBottom: 30 }}>
        <FeatureLabel
          text="Shipment Tracking"
          subtitle="Track your shipment from factory to doorstep. Live updates with vessel info, customs status, and delivery ETAs."
          delay={5}
        />
      </div>

      {/* Full-width screenshot below */}
      <div
        style={{
          opacity: screenSpring,
          transform: `scale(${screenScale}) translateY(${drift}px)`,
        }}
      >
        <ScreenFrame src="images/shipment-tracking-world.jpg" width={1750} />
      </div>
    </AbsoluteFill>
  );
};
