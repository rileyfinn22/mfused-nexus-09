import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { FeatureLabel } from "../components/FeatureLabel";

export const PullShipScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const screen1Spring = spring({ frame: frame - 8, fps, config: { damping: 20, stiffness: 150 } });
  const screen2Spring = spring({ frame: frame - 20, fps, config: { damping: 20, stiffness: 150 } });

  const drift = interpolate(frame, [0, 210], [5, -12]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 50 }}>
        {/* Left label */}
        <div style={{ width: 380, flexShrink: 0 }}>
          <FeatureLabel
            text="Pull & Ship + Inventory"
            subtitle="Pull inventory from warehouse, auto-generate partial invoices, track fulfillment vendors. Real-time stock levels with redline alerts."
            delay={5}
          />

          {/* Flow diagram */}
          <div style={{ marginTop: 35 }}>
            {["Pull Inventory", "Create Shipment", "Auto-Invoice", "Track Delivery"].map((step, i) => {
              const sp = spring({ frame: frame - 25 - i * 7, fps, config: { damping: 20 } });
              return (
                <div key={step} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, opacity: sp, transform: `translateX(${interpolate(sp, [0, 1], [-20, 0])}px)` }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: i < 3 ? "linear-gradient(135deg, #3b82f6, #6366f1)" : "rgba(59,130,246,0.2)",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "white",
                      fontFamily: "sans-serif",
                    }}
                  >
                    {i + 1}
                  </div>
                  <span style={{ fontSize: 17, color: "rgba(255,255,255,0.85)", fontFamily: "sans-serif", fontWeight: 500 }}>{step}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right screenshots */}
        <div style={{ position: "relative", flex: 1, height: 680 }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              opacity: screen1Spring,
              transform: `translateY(${drift}px)`,
            }}
          >
            <ScreenFrame src="images/pull-ship-orders.png" width={1100} />
          </div>
          <div
            style={{
              position: "absolute",
              top: 240,
              left: 220,
              opacity: screen2Spring,
              transform: `translateY(${drift * 0.5}px)`,
              zIndex: 2,
            }}
          >
            <ScreenFrame src="images/inventory.png" width={950} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
