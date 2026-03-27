import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { IntroScene } from "./scenes/IntroScene";
import { OrdersScene } from "./scenes/OrdersScene";
import { ProductionScene } from "./scenes/ProductionScene";
import { ProductionDeepDiveScene } from "./scenes/ProductionDeepDiveScene";
import { ArtworkScene } from "./scenes/ArtworkScene";
import { InvoicesScene } from "./scenes/InvoicesScene";
import { PrintWorkshopScene } from "./scenes/PrintWorkshopScene";
import { ShipmentScene } from "./scenes/ShipmentScene";
import { OutroScene } from "./scenes/OutroScene";

const BG_COLOR = "#0a0e1a";

export const MainVideo = () => {
  const frame = useCurrentFrame();

  const gradientAngle = interpolate(frame, [0, 1800], [135, 225]);

  return (
    <AbsoluteFill style={{ backgroundColor: BG_COLOR }}>
      {/* Persistent animated gradient background */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(${gradientAngle}deg, #0a0e1a 0%, #111827 40%, #0f172a 70%, #0a0e1a 100%)`,
        }}
      />

      {/* Persistent accent glow */}
      <AbsoluteFill style={{ opacity: 0.15 }}>
        <div
          style={{
            position: "absolute",
            width: 800,
            height: 800,
            borderRadius: "50%",
            background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)",
            top: -200,
            right: -200,
            filter: "blur(80px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)",
            bottom: -200,
            left: -100,
            filter: "blur(80px)",
          }}
        />
      </AbsoluteFill>

      {/* 9 scenes, 8 transitions × 20 frames = 160 overlap */}
      {/* Scene durations sum = 1960, total = 1960 - 160 = 1800 frames = 60s */}
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={200}>
          <IntroScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />

        <TransitionSeries.Sequence durationInFrames={210}>
          <OrdersScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-left" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />

        <TransitionSeries.Sequence durationInFrames={280}>
          <ProductionScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />

        <TransitionSeries.Sequence durationInFrames={280}>
          <ProductionDeepDiveScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-right" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />

        <TransitionSeries.Sequence durationInFrames={230}>
          <ArtworkScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />

        <TransitionSeries.Sequence durationInFrames={200}>
          <InvoicesScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-left" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />

        <TransitionSeries.Sequence durationInFrames={200}>
          <PrintWorkshopScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />

        <TransitionSeries.Sequence durationInFrames={210}>
          <ShipmentScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />

        <TransitionSeries.Sequence durationInFrames={200}>
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
