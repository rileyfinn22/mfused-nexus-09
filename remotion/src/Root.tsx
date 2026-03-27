import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

// Scene durations: 300+310+340+340+310+290+290+310+290 = 2780
// Transitions: 8 x 20 = 160 overlap
// Total: 2780 - 160 = 2620
export const RemotionRoot = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={2620}
    fps={30}
    width={1920}
    height={1080}
  />
);
