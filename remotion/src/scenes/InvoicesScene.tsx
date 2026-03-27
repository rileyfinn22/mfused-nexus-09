import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { FeatureLabel } from "../components/FeatureLabel";

export const InvoicesScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const screenSpring = spring({ frame: frame - 10, fps, config: { damping: 20, stiffness: 150 } });
  const screenScale = interpolate(screenSpring, [0, 1], [0.92, 1]);
  const drift = interpolate(frame, [0, 220], [10, -10]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 70 }}>
        {/* Left label */}
        <div style={{ width: 420, flexShrink: 0 }}>
          <FeatureLabel
            text="Invoices & Payments"
            subtitle="View all invoices, track payment history, and see outstanding balances. Partial billing keeps cash flow transparent."
            delay={5}
          />

          {/* Stats */}
          <div style={{ marginTop: 30, display: "flex", gap: 24 }}>
            {[
              { label: "Total Orders", value: "$27.4K", color: "#3b82f6" },
              { label: "Paid", value: "$14.4K", color: "#22c55e" },
              { label: "Balance Due", value: "$13K", color: "#f59e0b" },
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
                  <div style={{ fontSize: 30, fontWeight: 800, color: stat.color, fontFamily: "sans-serif" }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(148,163,184,0.7)", fontFamily: "sans-serif", marginTop: 4 }}>
                    {stat.label}
                  </div>
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
          <ScreenFrame src="images/customer-invoices.jpg" width={1200} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
