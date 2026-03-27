import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { FeatureLabel } from "../components/FeatureLabel";

export const InvoicesScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const screen1Spring = spring({ frame: frame - 8, fps, config: { damping: 20, stiffness: 150 } });
  const screen2Spring = spring({ frame: frame - 22, fps, config: { damping: 20, stiffness: 150 } });

  const drift = interpolate(frame, [0, 220], [10, -10]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 70 }}>
        {/* Left label */}
        <div style={{ width: 420, flexShrink: 0 }}>
          <FeatureLabel
            text="Invoices & Billing"
            subtitle="Blanket and partial invoices, payment tracking, QuickBooks sync. $1.18M in open orders at a glance."
            delay={5}
          />

          {/* Stats */}
          <div style={{ marginTop: 30, display: "flex", gap: 24 }}>
            {[
              { label: "Open Orders", value: "$1.18M", color: "#3b82f6" },
              { label: "Due Amount", value: "$158K", color: "#ef4444" },
            ].map((stat, i) => {
              const statSpring = spring({ frame: frame - 25 - i * 8, fps, config: { damping: 20 } });
              return (
                <div
                  key={stat.label}
                  style={{
                    opacity: statSpring,
                    transform: `translateY(${interpolate(statSpring, [0, 1], [20, 0])}px)`,
                  }}
                >
                  <div style={{ fontSize: 36, fontWeight: 800, color: stat.color, fontFamily: "sans-serif" }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 14, color: "rgba(148,163,184,0.7)", fontFamily: "sans-serif", marginTop: 4 }}>
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right screenshots */}
        <div style={{ position: "relative", flex: 1, height: 700 }}>
          <div
            style={{
              position: "absolute",
              top: 30,
              left: 0,
              opacity: screen1Spring,
              transform: `translateY(${drift}px)`,
            }}
          >
            <ScreenFrame src="images/invoices-list.png" width={1100} />
          </div>
          <div
            style={{
              position: "absolute",
              top: 250,
              left: 200,
              opacity: screen2Spring,
              transform: `translateY(${drift * 0.5}px)`,
              zIndex: 2,
            }}
          >
            <ScreenFrame src="images/invoice-detail.png" width={900} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
