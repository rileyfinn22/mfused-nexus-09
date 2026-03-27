import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

interface FeatureLabelProps {
  text: string;
  subtitle?: string;
  delay?: number;
  align?: "left" | "center";
}

export const FeatureLabel = ({ text, subtitle, delay = 0, align = "left" }: FeatureLabelProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame: frame - delay, fps, config: { damping: 20, stiffness: 180 } });
  const subtitleSpring = spring({ frame: frame - delay - 8, fps, config: { damping: 20, stiffness: 180 } });

  const titleY = interpolate(titleSpring, [0, 1], [40, 0]);
  const subtitleY = interpolate(subtitleSpring, [0, 1], [30, 0]);

  return (
    <div style={{ textAlign: align }}>
      <div
        style={{
          fontSize: 52,
          fontWeight: 800,
          color: "#ffffff",
          fontFamily: "sans-serif",
          letterSpacing: -1,
          opacity: titleSpring,
          transform: `translateY(${titleY}px)`,
          lineHeight: 1.1,
        }}
      >
        {text}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: 24,
            fontWeight: 400,
            color: "rgba(148,163,184,0.9)",
            fontFamily: "sans-serif",
            marginTop: 12,
            opacity: subtitleSpring,
            transform: `translateY(${subtitleY}px)`,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
};
