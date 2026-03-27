import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { FeatureLabel } from "../components/FeatureLabel";

export const ArtworkScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const screen1Spring = spring({ frame: frame - 8, fps, config: { damping: 20, stiffness: 150 } });
  const screen2Spring = spring({ frame: frame - 22, fps, config: { damping: 20, stiffness: 150 } });
  const drift = interpolate(frame, [0, 230], [0, -15]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 60 }}>
        {/* Screenshots stacked */}
        <div style={{ position: "relative", flex: 1, height: 700 }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              opacity: screen1Spring,
              transform: `translateY(${drift}px)`,
            }}
          >
            <ScreenFrame src="images/artwork-templates.jpg" width={1100} />
          </div>
          <div
            style={{
              position: "absolute",
              top: 220,
              left: 250,
              opacity: screen2Spring,
              transform: `translateY(${drift * 0.5}px)`,
              zIndex: 2,
            }}
          >
            <ScreenFrame src="images/artwork-proof-detail.jpg" width={900} />
          </div>
        </div>

        {/* Right label */}
        <div style={{ width: 420, flexShrink: 0 }}>
          <FeatureLabel
            text="Artwork & Proofs"
            subtitle="Browse your templates, review flat proofs, and approve artwork — all in one place. Version history keeps every revision tracked."
            delay={5}
          />

          {/* Stats row */}
          <div style={{ display: "flex", gap: 30, marginTop: 30 }}>
            {[
              { n: "8", label: "Templates" },
              { n: "3", label: "Pending Review" },
              { n: "12", label: "Approved" },
            ].map((s, i) => {
              const sp = spring({ frame: frame - 25 - i * 6, fps, config: { damping: 20 } });
              return (
                <div key={s.label} style={{ opacity: sp, transform: `translateY(${interpolate(sp, [0, 1], [15, 0])}px)` }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: "#22c55e", fontFamily: "sans-serif" }}>{s.n}</div>
                  <div style={{ fontSize: 13, color: "rgba(148,163,184,0.6)", fontFamily: "sans-serif" }}>{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
