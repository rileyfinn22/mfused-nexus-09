import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { FeatureLabel } from "../components/FeatureLabel";

export const OrdersScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const screenSpring = spring({ frame: frame - 10, fps, config: { damping: 20, stiffness: 150 } });
  const screenScale = interpolate(screenSpring, [0, 1], [0.9, 1]);
  const screenX = interpolate(screenSpring, [0, 1], [100, 0]);

  // Slow parallax drift
  const drift = interpolate(frame, [0, 220], [0, -20]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 80 }}>
        {/* Left label */}
        <div style={{ width: 400, flexShrink: 0 }}>
          <FeatureLabel
            text="Orders & Production"
            subtitle="Track every order from quote to delivery. Real-time progress bars show exactly where each job stands."
            delay={5}
          />
        </div>

        {/* Right screenshot */}
        <div
          style={{
            flex: 1,
            transform: `scale(${screenScale}) translateX(${screenX}px) translateY(${drift}px)`,
            opacity: screenSpring,
          }}
        >
          <ScreenFrame src="images/orders-list.png" width={1300} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
