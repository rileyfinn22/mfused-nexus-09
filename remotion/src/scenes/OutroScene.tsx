import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const OutroScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({ frame, fps, config: { damping: 12, stiffness: 100, mass: 1.5 } });
  const titleSpring = spring({ frame: frame - 15, fps, config: { damping: 20, stiffness: 180 } });
  const subSpring = spring({ frame: frame - 28, fps, config: { damping: 20, stiffness: 180 } });
  const lineSpring = spring({ frame: frame - 20, fps, config: { damping: 200 } });

  const features = [
    "Order Tracking",
    "Production Visibility",
    "Artwork Proofs",
    "Invoice & Payments",
    "Shipment Tracking",
    "Print Workshop",
  ];

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Logo */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          background: "linear-gradient(135deg, #b8cf68, #6a9b40)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          opacity: logoSpring,
          transform: `scale(${interpolate(logoSpring, [0, 1], [0.5, 1])})`,
          marginBottom: 24,
          boxShadow: "0 0 80px rgba(184,207,104,0.4)",
        }}
      >
        <span style={{ fontSize: 44, fontWeight: 900, color: "white", fontFamily: "sans-serif" }}>V</span>
      </div>

      <div
        style={{
          fontSize: 64,
          fontWeight: 900,
          color: "#ffffff",
          fontFamily: "sans-serif",
          letterSpacing: -2,
          opacity: titleSpring,
          transform: `translateY(${interpolate(titleSpring, [0, 1], [40, 0])}px)`,
          textAlign: "center",
        }}
      >
        Total Transparency, Zero Guesswork
      </div>

      <div
        style={{
          width: interpolate(lineSpring, [0, 1], [0, 160]),
          height: 3,
          background: "linear-gradient(90deg, #b8cf68, #6a9b40)",
          borderRadius: 2,
          marginTop: 20,
          marginBottom: 30,
        }}
      />

      {/* Feature chips */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", maxWidth: 800 }}>
        {features.map((f, i) => {
          const chipSpring = spring({ frame: frame - 30 - i * 5, fps, config: { damping: 18 } });
          return (
            <div
              key={f}
              style={{
                padding: "10px 24px",
                borderRadius: 24,
                background: "rgba(184,207,104,0.1)",
                border: "1px solid rgba(184,207,104,0.25)",
                color: "#b8cf68",
                fontSize: 17,
                fontWeight: 600,
                fontFamily: "sans-serif",
                opacity: chipSpring,
                transform: `scale(${interpolate(chipSpring, [0, 1], [0.8, 1])})`,
              }}
            >
              {f}
            </div>
          );
        })}
      </div>

      {/* URL */}
      <div
        style={{
          marginTop: 50,
          fontSize: 22,
          color: "rgba(162,167,175,0.5)",
          fontFamily: "sans-serif",
          opacity: subSpring,
        }}
      >
        vibepkgportal.lovable.app
      </div>
    </AbsoluteFill>
  );
};
