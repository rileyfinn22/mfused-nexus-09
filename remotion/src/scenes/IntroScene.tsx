import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const IntroScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({ frame, fps, config: { damping: 15, stiffness: 120, mass: 1.5 } });
  const logoScale = interpolate(logoSpring, [0, 1], [0.5, 1]);
  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1]);

  const titleSpring = spring({ frame: frame - 20, fps, config: { damping: 20, stiffness: 180 } });
  const titleY = interpolate(titleSpring, [0, 1], [60, 0]);

  const subSpring = spring({ frame: frame - 35, fps, config: { damping: 20, stiffness: 180 } });
  const subY = interpolate(subSpring, [0, 1], [40, 0]);

  const tagSpring = spring({ frame: frame - 50, fps, config: { damping: 20, stiffness: 180 } });

  const lineWidth = interpolate(frame, [25, 55], [0, 200], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Logo mark */}
      <div
        style={{
          width: 100,
          height: 100,
          borderRadius: 24,
          background: "linear-gradient(135deg, #b8cf68, #6a9b40)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          marginBottom: 30,
          boxShadow: "0 0 60px rgba(184,207,104,0.3)",
        }}
      >
        <span style={{ fontSize: 56, fontWeight: 900, color: "white", fontFamily: "sans-serif" }}>V</span>
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 82,
          fontWeight: 900,
          color: "#ffffff",
          fontFamily: "sans-serif",
          letterSpacing: -3,
          opacity: titleSpring,
          transform: `translateY(${titleY}px)`,
        }}
      >
        Vibe Packaging
      </div>

      {/* Accent line */}
      <div
        style={{
          width: lineWidth,
          height: 4,
          background: "linear-gradient(90deg, #b8cf68, #6a9b40)",
          borderRadius: 2,
          marginTop: 16,
          marginBottom: 16,
        }}
      />

      {/* Subtitle */}
      <div
        style={{
          fontSize: 32,
          fontWeight: 500,
          color: "rgba(210,213,216,0.95)",
          fontFamily: "sans-serif",
          opacity: subSpring,
          transform: `translateY(${subY}px)`,
          letterSpacing: 6,
          textTransform: "uppercase",
        }}
      >
        Your Packaging Portal
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 22,
          color: "rgba(162,167,175,0.7)",
          fontFamily: "sans-serif",
          marginTop: 40,
          opacity: tagSpring,
          textAlign: "center",
          maxWidth: 700,
          lineHeight: 1.6,
        }}
      >
        Full visibility into every order — from artwork approval to production tracking to delivery
      </div>
    </AbsoluteFill>
  );
};
