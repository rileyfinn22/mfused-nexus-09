import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const IntroScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo / brand entrance
  const logoSpring = spring({ frame, fps, config: { damping: 15, stiffness: 120, mass: 1.5 } });
  const logoScale = interpolate(logoSpring, [0, 1], [0.5, 1]);
  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1]);

  // Title
  const titleSpring = spring({ frame: frame - 20, fps, config: { damping: 20, stiffness: 180 } });
  const titleY = interpolate(titleSpring, [0, 1], [60, 0]);

  // Subtitle
  const subSpring = spring({ frame: frame - 35, fps, config: { damping: 20, stiffness: 180 } });
  const subY = interpolate(subSpring, [0, 1], [40, 0]);

  // Tagline
  const tagSpring = spring({ frame: frame - 50, fps, config: { damping: 20, stiffness: 180 } });

  // Accent line
  const lineWidth = interpolate(frame, [25, 55], [0, 200], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* V Logo */}
      <div
        style={{
          width: 100,
          height: 100,
          borderRadius: 24,
          background: "linear-gradient(135deg, #3b82f6, #6366f1)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          marginBottom: 30,
          boxShadow: "0 0 60px rgba(59,130,246,0.3)",
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
        VibePKG
      </div>

      {/* Accent line */}
      <div
        style={{
          width: lineWidth,
          height: 4,
          background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
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
          color: "rgba(148,163,184,0.95)",
          fontFamily: "sans-serif",
          opacity: subSpring,
          transform: `translateY(${subY}px)`,
          letterSpacing: 6,
          textTransform: "uppercase",
        }}
      >
        Packaging Portal
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 22,
          color: "rgba(148,163,184,0.6)",
          fontFamily: "sans-serif",
          marginTop: 40,
          opacity: tagSpring,
        }}
      >
        Order · Track · Ship · Invoice — All in One Place
      </div>
    </AbsoluteFill>
  );
};
