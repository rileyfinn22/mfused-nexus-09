import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { FeatureLabel } from "../components/FeatureLabel";

export const PrintWorkshopScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const screenSpring = spring({ frame: frame - 10, fps, config: { damping: 20, stiffness: 150 } });
  const screenScale = interpolate(screenSpring, [0, 1], [0.9, 1]);
  const drift = interpolate(frame, [0, 230], [8, -12]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 70 }}>
        {/* Left label */}
        <div style={{ width: 420, flexShrink: 0 }}>
          <FeatureLabel
            text="Design Your Packaging"
            subtitle="Use our built-in Print Workshop to customize templates, place artwork, and submit designs — all from your browser."
            delay={5}
          />

          {/* Feature pills */}
          <div style={{ display: "flex", gap: 10, marginTop: 30, flexWrap: "wrap" }}>
            {["Template Library", "Visual Editor", "Material Selection", "Instant Preview"].map((pill, i) => {
              const pillSpring = spring({ frame: frame - 30 - i * 6, fps, config: { damping: 20 } });
              return (
                <div
                  key={pill}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 20,
                    background: "rgba(139,92,246,0.15)",
                    border: "1px solid rgba(139,92,246,0.3)",
                    color: "#a78bfa",
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

        {/* Right screenshot */}
        <div
          style={{
            flex: 1,
            opacity: screenSpring,
            transform: `scale(${screenScale}) translateY(${drift}px)`,
          }}
        >
          <ScreenFrame src="images/print-workshop-customer.jpg" width={1300} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
