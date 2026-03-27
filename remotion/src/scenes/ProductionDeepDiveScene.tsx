import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { FeatureLabel } from "../components/FeatureLabel";

export const ProductionDeepDiveScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const screenSpring = spring({ frame: frame - 8, fps, config: { damping: 20, stiffness: 150 } });
  const screenScale = interpolate(screenSpring, [0, 1], [0.92, 1]);
  const drift = interpolate(frame, [0, 280], [8, -12]);

  // Animated timeline stages
  const stages = [
    { name: "Prepare Materials", status: "complete", color: "#22c55e" },
    { name: "Pre-Press & Proofs", status: "complete", color: "#22c55e" },
    { name: "Production Working", status: "active", color: "#3b82f6" },
    { name: "In Transit", status: "pending", color: "#475569" },
    { name: "Delivered", status: "pending", color: "#475569" },
  ];

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 70 }}>
        {/* Left — animated timeline */}
        <div style={{ width: 460, flexShrink: 0 }}>
          <FeatureLabel
            text="Transparency That Plans"
            subtitle="Every stage is visible — plan your launch dates, coordinate marketing, and schedule deliveries with confidence."
            delay={5}
          />

          {/* Timeline */}
          <div style={{ marginTop: 35 }}>
            {stages.map((stage, i) => {
              const sp = spring({ frame: frame - 25 - i * 8, fps, config: { damping: 20 } });
              const isActive = stage.status === "active";
              const pulse = isActive ? 0.7 + 0.3 * Math.sin(frame * 0.15) : 1;

              return (
                <div
                  key={stage.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    marginBottom: 18,
                    opacity: sp,
                    transform: `translateX(${interpolate(sp, [0, 1], [-30, 0])}px)`,
                  }}
                >
                  {/* Status dot */}
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: stage.color,
                      opacity: pulse,
                      boxShadow: isActive ? `0 0 20px ${stage.color}60` : "none",
                      flexShrink: 0,
                    }}
                  />
                  {/* Connector line */}
                  {i < stages.length - 1 && (
                    <div
                      style={{
                        position: "absolute",
                        left: 9,
                        top: 28,
                        width: 2,
                        height: 22,
                        background: stage.status === "complete" ? "#22c55e40" : "#47556940",
                      }}
                    />
                  )}
                  <div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: isActive ? 700 : 500,
                        color: stage.status === "pending" ? "rgba(148,163,184,0.4)" : "rgba(255,255,255,0.9)",
                        fontFamily: "sans-serif",
                      }}
                    >
                      {stage.name}
                      {stage.status === "complete" && " ✓"}
                    </div>
                    {isActive && (
                      <div style={{ fontSize: 13, color: "#60a5fa", fontFamily: "sans-serif", marginTop: 2 }}>
                        65% — Cutting stage
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right screenshot — production timeline detail */}
        <div
          style={{
            flex: 1,
            opacity: screenSpring,
            transform: `scale(${screenScale}) translateY(${drift}px)`,
          }}
        >
          <ScreenFrame src="images/production-timeline.jpg" width={1200} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
