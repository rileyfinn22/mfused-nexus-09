import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const IntroScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({ frame, fps, config: { damping: 15, stiffness: 120, mass: 1.5 } });
  const logoScale = interpolate(logoSpring, [0, 1], [0.5, 1]);
  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1]);

  const subSpring = spring({ frame: frame - 25, fps, config: { damping: 20, stiffness: 180 } });
  const subY = interpolate(subSpring, [0, 1], [40, 0]);

  const tagSpring = spring({ frame: frame - 45, fps, config: { damping: 20, stiffness: 180 } });

  const lineWidth = interpolate(frame, [20, 50], [0, 200], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Vibe Packaging Logo */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          marginBottom: 20,
        }}
      >
        <Img
          src={staticFile("images/vibe-logo-dark.png")}
          style={{ width: 500, height: "auto" }}
        />
      </div>

      {/* Accent line */}
      <div
        style={{
          width: lineWidth,
          height: 4,
          background: "linear-gradient(90deg, #b8cf68, #6a9b40)",
          borderRadius: 2,
          marginTop: 10,
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
