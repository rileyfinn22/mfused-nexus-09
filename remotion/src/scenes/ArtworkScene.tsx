import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { FeatureLabel } from "../components/FeatureLabel";

export const ArtworkScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const screenSpring = spring({ frame: frame - 10, fps, config: { damping: 20, stiffness: 150 } });
  const screenScale = interpolate(screenSpring, [0, 1], [0.92, 1]);
  const drift = interpolate(frame, [0, 230], [0, -15]);

  const products = [
    { src: "images/product-cureify-bag.jpg", delay: 20 },
    { src: "images/product-tyson-bag.jpg", delay: 30 },
    { src: "images/product-river-jar.jpg", delay: 40 },
  ];

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 50 }}>
        {/* Left: screenshot */}
        <div style={{ flex: 1, opacity: screenSpring, transform: `scale(${screenScale}) translateY(${drift}px)` }}>
          <ScreenFrame src="images/real-artwork-library.png" width={1100} />
        </div>

        {/* Right: label + product photos */}
        <div style={{ width: 420, flexShrink: 0 }}>
          <FeatureLabel text="Artwork & Proofs" subtitle="Browse templates, review proofs, and approve artwork — all in one place. Version history keeps every revision tracked." delay={5} />

          {/* Product showcase */}
          <div style={{ display: "flex", gap: 12, marginTop: 30 }}>
            {products.map((p, i) => {
              const sp = spring({ frame: frame - p.delay, fps, config: { damping: 20 } });
              return (
                <div
                  key={p.src}
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: 10,
                    overflow: "hidden",
                    border: "2px solid rgba(184,207,104,0.3)",
                    opacity: sp,
                    transform: `scale(${interpolate(sp, [0, 1], [0.8, 1])})`,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  }}
                >
                  <Img
                    src={staticFile(p.src)}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 30, marginTop: 20 }}>
            {[{ n: "12", label: "Total Files" }, { n: "7", label: "Approved" }, { n: "10", label: "Products" }].map((s, i) => {
              const sp = spring({ frame: frame - 50 - i * 6, fps, config: { damping: 20 } });
              return (
                <div key={s.label} style={{ opacity: sp, transform: `translateY(${interpolate(sp, [0, 1], [15, 0])}px)` }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#b8cf68", fontFamily: "sans-serif" }}>{s.n}</div>
                  <div style={{ fontSize: 12, color: "rgba(148,163,184,0.6)", fontFamily: "sans-serif" }}>{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
