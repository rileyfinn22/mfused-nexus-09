import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { FeatureLabel } from "../components/FeatureLabel";

export const ShipmentScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mapSpring = spring({ frame: frame - 10, fps, config: { damping: 20, stiffness: 150 } });
  const mapScale = interpolate(mapSpring, [0, 1], [0.95, 1]);
  const drift = interpolate(frame, [0, 210], [5, -8]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 50px" }}>
      {/* Label on top */}
      <div style={{ marginBottom: 24 }}>
        <FeatureLabel
          text="Shipment Tracking"
          subtitle="Track your shipment from factory to doorstep. Live updates with vessel info, customs status, and delivery ETAs."
          delay={5}
        />
      </div>

      {/* Full-width world map below */}
      <div
        style={{
          opacity: mapSpring,
          transform: `scale(${mapScale}) translateY(${drift}px)`,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 25px 80px rgba(0,0,0,0.5), 0 0 40px rgba(106,155,64,0.1)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Img
          src={staticFile("images/shipment-tracking-world.jpg")}
          style={{ width: "100%", display: "block" }}
        />
      </div>
    </AbsoluteFill>
  );
};
