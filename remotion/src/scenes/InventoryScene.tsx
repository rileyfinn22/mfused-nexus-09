import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { FeatureLabel } from "../components/FeatureLabel";

export const InventoryScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const screenSpring = spring({ frame: frame - 10, fps, config: { damping: 20, stiffness: 150 } });
  const screenScale = interpolate(screenSpring, [0, 1], [0.92, 1]);
  const drift = interpolate(frame, [0, 200], [0, -10]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 80 }}>
        {/* Screenshot left */}
        <div
          style={{
            flex: 1,
            opacity: screenSpring,
            transform: `scale(${screenScale}) translateY(${drift}px)`,
          }}
        >
          <ScreenFrame src="images/inventory.png" width={1200} />
        </div>

        {/* Right label */}
        <div style={{ width: 420, flexShrink: 0 }}>
          <FeatureLabel
            text="Inventory Management"
            subtitle="Track stock levels across warehouses. Automated redline alerts, upload bulk inventory data, and allocate to invoices seamlessly."
            delay={5}
          />

          {/* Stats row */}
          <div style={{ display: "flex", gap: 30, marginTop: 30 }}>
            {[
              { n: "12K", label: "Units Tracked", color: "#3b82f6" },
              { n: "48", label: "SKUs Active", color: "#22c55e" },
              { n: "3", label: "Warehouses", color: "#f59e0b" },
            ].map((s, i) => {
              const sp = spring({ frame: frame - 25 - i * 6, fps, config: { damping: 20 } });
              return (
                <div key={s.label} style={{ opacity: sp, transform: `translateY(${interpolate(sp, [0, 1], [15, 0])}px)` }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: s.color, fontFamily: "sans-serif" }}>{s.n}</div>
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
