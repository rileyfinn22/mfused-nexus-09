import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

// Scene durations: 250+270+300+300+270+250+250+270+250 = 2210
// Transitions: 8 x 20 = 160 overlap
// Total: 2210 - 160 = 2050
export const RemotionRoot = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={2280}
    fps={30}
    width={1920}
    height={1080}
  />
);
