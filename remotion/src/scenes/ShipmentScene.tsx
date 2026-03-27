import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

// Simplified world map dot positions (normalized 0-1 coordinates)
// These create recognizable continent outlines
const CONTINENT_DOTS: [number, number][][] = [
  // North America
  [[0.12,0.22],[0.14,0.20],[0.16,0.19],[0.18,0.18],[0.20,0.19],[0.22,0.20],[0.15,0.24],[0.17,0.23],[0.19,0.22],[0.21,0.23],[0.13,0.27],[0.15,0.28],[0.17,0.26],[0.19,0.25],[0.21,0.26],[0.14,0.31],[0.16,0.30],[0.18,0.29],[0.20,0.28],[0.22,0.29],[0.16,0.33],[0.18,0.32],[0.20,0.31],[0.22,0.32],[0.17,0.35],[0.19,0.34],[0.21,0.34],[0.23,0.33],[0.18,0.37],[0.20,0.36],[0.22,0.36]],
  // South America
  [[0.24,0.52],[0.26,0.50],[0.28,0.49],[0.25,0.55],[0.27,0.53],[0.29,0.52],[0.26,0.58],[0.28,0.56],[0.27,0.61],[0.29,0.59],[0.26,0.64],[0.28,0.62],[0.25,0.67],[0.27,0.65],[0.24,0.70],[0.26,0.68],[0.25,0.73]],
  // Europe
  [[0.46,0.18],[0.48,0.17],[0.50,0.16],[0.47,0.21],[0.49,0.20],[0.51,0.19],[0.48,0.24],[0.50,0.23],[0.52,0.22],[0.49,0.27],[0.51,0.26],[0.53,0.25],[0.50,0.30],[0.52,0.29],[0.54,0.28]],
  // Africa
  [[0.48,0.38],[0.50,0.36],[0.52,0.35],[0.49,0.41],[0.51,0.39],[0.53,0.38],[0.50,0.44],[0.52,0.42],[0.54,0.41],[0.51,0.47],[0.53,0.45],[0.52,0.50],[0.54,0.48],[0.51,0.53],[0.53,0.51],[0.50,0.56],[0.52,0.54],[0.51,0.58]],
  // Asia
  [[0.56,0.18],[0.58,0.17],[0.60,0.16],[0.62,0.17],[0.64,0.18],[0.57,0.21],[0.59,0.20],[0.61,0.19],[0.63,0.20],[0.65,0.21],[0.67,0.20],[0.58,0.24],[0.60,0.23],[0.62,0.22],[0.64,0.23],[0.66,0.24],[0.68,0.23],[0.70,0.24],[0.59,0.27],[0.61,0.26],[0.63,0.25],[0.65,0.26],[0.67,0.27],[0.69,0.26],[0.71,0.27],[0.60,0.30],[0.62,0.29],[0.64,0.28],[0.66,0.29],[0.68,0.30],[0.70,0.29],[0.72,0.30],[0.74,0.29],[0.63,0.32],[0.65,0.31],[0.67,0.32],[0.69,0.33],[0.71,0.32],[0.73,0.33],[0.75,0.32],[0.66,0.35],[0.68,0.34],[0.70,0.35],[0.72,0.36],[0.74,0.35]],
  // Australia
  [[0.76,0.55],[0.78,0.54],[0.80,0.53],[0.77,0.58],[0.79,0.57],[0.81,0.56],[0.78,0.61],[0.80,0.60],[0.79,0.63]],
];

// Route: Shenzhen → across Pacific → Long Beach
// Using cubic bezier points for a nice arc
const ROUTE_PATH = "M 720 310 C 820 200, 400 150, 200 340";

// Get point on cubic bezier at t (0-1)
function bezierPoint(t: number): [number, number] {
  const p0 = [720, 310];
  const p1 = [820, 200];
  const p2 = [400, 150];
  const p3 = [200, 340];
  const mt = 1 - t;
  const x = mt*mt*mt*p0[0] + 3*mt*mt*t*p1[0] + 3*mt*t*t*p2[0] + t*t*t*p3[0];
  const y = mt*mt*mt*p0[1] + 3*mt*mt*t*p1[1] + 3*mt*t*t*p2[1] + t*t*t*p3[1];
  return [x, y];
}

const TrackingLeg = ({ icon, label, carrier, status, statusColor, delay, frame, fps }: {
  icon: string; label: string; carrier: string; status: string; statusColor: string; delay: number;
  frame: number; fps: number;
}) => {
  const s = spring({ frame: frame - delay, fps, config: { damping: 20, stiffness: 180 } });
  const y = interpolate(s, [0, 1], [20, 0]);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      opacity: s, transform: `translateY(${y}px)`,
    }}>
      <div style={{ fontSize: 20, width: 32, textAlign: "center" }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600, fontFamily: "sans-serif" }}>{label}</div>
        <div style={{ color: "#94a3b8", fontSize: 12, fontFamily: "sans-serif" }}>{carrier}</div>
      </div>
      <div style={{
        padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
        fontFamily: "sans-serif", background: statusColor, color: "#fff",
      }}>{status}</div>
    </div>
  );
};

export const ShipmentScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animations
  const cardSpring = spring({ frame: frame - 5, fps, config: { damping: 20, stiffness: 150 } });
  const cardX = interpolate(cardSpring, [0, 1], [-60, 0]);

  const mapSpring = spring({ frame: frame - 10, fps, config: { damping: 25, stiffness: 120 } });

  // Route draw progress (animate over frames 20-150)
  const routeProgress = interpolate(frame, [20, 150], [0, 0.65], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const routeLength = 900; // approximate path length
  const dashOffset = routeLength * (1 - routeProgress);

  // Ship position along route
  const shipPos = bezierPoint(routeProgress);

  // Progress bar
  const progressSpring = spring({ frame: frame - 40, fps, config: { damping: 30, stiffness: 100 } });
  const progressWidth = interpolate(progressSpring, [0, 1], [0, 65]);

  // Title
  const titleSpring = spring({ frame: frame - 2, fps, config: { damping: 20, stiffness: 180 } });
  const titleY = interpolate(titleSpring, [0, 1], [30, 0]);

  // Pulsing glow on ship
  const pulse = Math.sin(frame * 0.15) * 0.3 + 0.7;

  // Origin/destination dots
  const originSpring = spring({ frame: frame - 15, fps, config: { damping: 15 } });
  const destSpring = spring({ frame: frame - 25, fps, config: { damping: 15 } });

  return (
    <AbsoluteFill style={{ padding: "40px 50px" }}>
      {/* SVG Map Layer */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        opacity: interpolate(mapSpring, [0, 1], [0, 0.5]),
      }}>
        <svg viewBox="0 0 1000 700" style={{ width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid meet">
          {/* Continent dots */}
          {CONTINENT_DOTS.flat().map(([x, y], i) => (
            <circle
              key={i}
              cx={x * 1000}
              cy={y * 1000}
              r={2.5}
              fill="rgba(148,163,184,0.25)"
            />
          ))}
        </svg>
      </div>

      {/* Route + Ship SVG overlay */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: mapSpring }}>
        <svg viewBox="0 0 1000 700" style={{ width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid meet">
          {/* Route glow */}
          <defs>
            <filter id="routeGlow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="shipGlow">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Route trail (dim) */}
          <path d={ROUTE_PATH} fill="none" stroke="rgba(106,155,64,0.15)" strokeWidth={3} />

          {/* Route animated line */}
          <path
            d={ROUTE_PATH}
            fill="none"
            stroke="#6a9b40"
            strokeWidth={3}
            strokeDasharray={routeLength}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            filter="url(#routeGlow)"
          />

          {/* Origin dot - Shenzhen */}
          <circle cx={720} cy={310} r={interpolate(originSpring, [0,1], [0, 7])} fill="#6a9b40" opacity={originSpring} />
          <circle cx={720} cy={310} r={interpolate(originSpring, [0,1], [0, 12])} fill="none" stroke="#6a9b40" strokeWidth={1.5} opacity={originSpring * 0.4} />
          <text x={720} y={335} textAnchor="middle" fill="#94a3b8" fontSize={11} fontFamily="sans-serif" opacity={originSpring}>Shenzhen</text>

          {/* Destination dot - Long Beach */}
          <circle cx={200} cy={340} r={interpolate(destSpring, [0,1], [0, 7])} fill="#b8cf68" opacity={destSpring} />
          <circle cx={200} cy={340} r={interpolate(destSpring, [0,1], [0, 12])} fill="none" stroke="#b8cf68" strokeWidth={1.5} opacity={destSpring * 0.4} />
          <text x={200} y={365} textAnchor="middle" fill="#94a3b8" fontSize={11} fontFamily="sans-serif" opacity={destSpring}>Long Beach</text>

          {/* Ship icon */}
          {routeProgress > 0.01 && (
            <g filter="url(#shipGlow)">
              <circle cx={shipPos[0]} cy={shipPos[1]} r={18} fill="rgba(106,155,64,0.15)" opacity={pulse} />
              <text x={shipPos[0]} y={shipPos[1] + 6} textAnchor="middle" fontSize={18}>🚢</text>
            </g>
          )}
        </svg>
      </div>

      {/* Tracking Info Card */}
      <div style={{
        position: "absolute",
        left: 50,
        top: "50%",
        transform: `translateY(-50%) translateX(${cardX}px)`,
        opacity: cardSpring,
        width: 380,
        background: "linear-gradient(135deg, rgba(30,37,48,0.95) 0%, rgba(26,31,42,0.98) 100%)",
        borderRadius: 16,
        padding: "28px 24px",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 30px rgba(106,155,64,0.08)",
      }}>
        {/* Header */}
        <div style={{
          opacity: titleSpring,
          transform: `translateY(${titleY}px)`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6a9b40", fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
            Live Tracking
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#ffffff", fontFamily: "sans-serif", letterSpacing: -0.5, marginBottom: 4 }}>
            Shipment Tracking
          </div>
          <div style={{ fontSize: 13, color: "#64748b", fontFamily: "sans-serif", marginBottom: 20 }}>
            Order #ORD-2847 • Brightside Beverages
          </div>
        </div>

        {/* Tracking Legs */}
        <TrackingLeg icon="🚢" label="International Freight" carrier="COSCO • CSLU2847591" status="In Transit" statusColor="rgba(59,130,246,0.8)" delay={30} frame={frame} fps={fps} />
        <TrackingLeg icon="🛃" label="Customs Clearance" carrier="US Customs & Border" status="Pending" statusColor="rgba(100,116,139,0.6)" delay={40} frame={frame} fps={fps} />
        <TrackingLeg icon="🚛" label="Domestic Delivery" carrier="FedEx Freight" status="Pending" statusColor="rgba(100,116,139,0.6)" delay={50} frame={frame} fps={fps} />

        {/* Progress */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "sans-serif" }}>Overall Progress</span>
            <span style={{ fontSize: 12, color: "#b8cf68", fontWeight: 700, fontFamily: "sans-serif" }}>{Math.round(progressWidth)}%</span>
          </div>
          <div style={{
            height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 3, width: `${progressWidth}%`,
              background: "linear-gradient(90deg, #6a9b40, #b8cf68)",
              boxShadow: "0 0 12px rgba(106,155,64,0.4)",
            }} />
          </div>
        </div>

        {/* Route info */}
        <div style={{
          marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center",
          opacity: interpolate(spring({ frame: frame - 60, fps, config: { damping: 20 } }), [0, 1], [0, 1]),
        }}>
          <div>
            <div style={{ fontSize: 10, color: "#64748b", fontFamily: "sans-serif" }}>ORIGIN</div>
            <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600, fontFamily: "sans-serif" }}>Shenzhen, CN</div>
          </div>
          <div style={{ fontSize: 18, color: "#6a9b40" }}>→</div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#64748b", fontFamily: "sans-serif" }}>DESTINATION</div>
            <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600, fontFamily: "sans-serif" }}>Long Beach, CA</div>
          </div>
        </div>

        {/* ETA */}
        <div style={{
          marginTop: 14, padding: "10px 14px", borderRadius: 10,
          background: "rgba(106,155,64,0.08)", border: "1px solid rgba(106,155,64,0.15)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          opacity: interpolate(spring({ frame: frame - 70, fps, config: { damping: 20 } }), [0, 1], [0, 1]),
        }}>
          <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "sans-serif" }}>Estimated Arrival</span>
          <span style={{ fontSize: 14, color: "#b8cf68", fontWeight: 700, fontFamily: "sans-serif" }}>Apr 14, 2026</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
