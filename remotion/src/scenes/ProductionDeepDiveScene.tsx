import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { FeatureLabel } from "../components/FeatureLabel";

export const ProductionDeepDiveScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const screen1Spring = spring({ frame: frame - 8, fps, config: { damping: 20, stiffness: 150 } });
  const screen2Spring = spring({ frame: frame - 22, fps, config: { damping: 20, stiffness: 150 } });
  const drift = interpolate(frame, [0, 280], [8, -12]);

  const stages = [
    { name: "Prepare Materials", status: "complete", color: "#6a9b40" },
    { name: "Pre-Press & Proofs", status: "complete", color: "#6a9b40" },
    { name: "Production Working", status: "active", color: "#b8cf68" },
    { name: "In Transit", status: "pending", color: "#475569" },
    { name: "Delivered", status: "pending", color: "#475569" },
  ];

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 40px" }}>
      {/* Top: label + stages side by side - compact */}
      <div style={{ display: "flex", gap: 50, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <FeatureLabel text="Transparency That Plans" subtitle="Every stage is visible — plan launches and coordinate deliveries with confidence." delay={5} />
        </div>
        <div style={{ width: 320, flexShrink: 0, paddingTop: 10 }}>
          {stages.map((stage, i) => {
            const sp = spring({ frame: frame - 25 - i * 8, fps, config: { damping: 20 } });
            const isActive = stage.status === "active";
            const pulse = isActive ? 0.7 + 0.3 * Math.sin(frame * 0.15) : 1;
            return (
              <div key={stage.name} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, opacity: sp, transform: `translateX(${interpolate(sp, [0, 1], [-30, 0])}px)` }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: stage.color, opacity: pulse, boxShadow: isActive ? `0 0 20px ${stage.color}60` : "none", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: isActive ? 700 : 500, color: stage.status === "pending" ? "rgba(148,163,184,0.4)" : "rgba(255,255,255,0.9)", fontFamily: "sans-serif" }}>
                    {stage.name}{stage.status === "complete" && " ✓"}
                  </div>
                  {isActive && <div style={{ fontSize: 11, color: "#b8cf68", fontFamily: "sans-serif", marginTop: 2 }}>72% — Production stage</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Bottom: screenshots - BIGGER */}
      <div style={{ position: "relative", width: "100%", height: 560 }}>
        <div style={{ position: "absolute", top: 0, left: 0, opacity: screen1Spring, transform: `translateY(${drift}px)` }}>
          <ScreenFrame src="images/real-production-detail-top.png" width={1050} />
        </div>
        <div style={{ position: "absolute", top: 40, left: 750, opacity: screen2Spring, transform: `translateY(${drift * 0.5}px)`, zIndex: 2 }}>
          <ScreenFrame src="images/real-production-detail-bottom.png" width={1050} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
