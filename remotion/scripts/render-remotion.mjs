import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("Bundling...");
const bundled = await bundle({
  entryPoint: path.resolve(__dirname, "../src/index.ts"),
  webpackOverride: (config) => config,
});

console.log("Opening browser...");
const browser = await openBrowser("chrome", {
  browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium",
  chromiumOptions: {
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  },
  chromeMode: "chrome-for-testing",
});

console.log("Selecting composition...");
const composition = await selectComposition({
  serveUrl: bundled,
  id: "main",
  puppeteerInstance: browser,
});

console.log(`Rendering ${composition.durationInFrames} frames at ${composition.fps}fps...`);
await renderMedia({
  composition,
  serveUrl: bundled,
  codec: "h264",
  outputLocation: "/tmp/vibepkg-video-only.mp4",
  puppeteerInstance: browser,
  muted: true,
  concurrency: 1,
});

await browser.close({ silent: false });

// Mux audio with system ffmpeg
console.log("Muxing background music...");
const videoDuration = composition.durationInFrames / composition.fps;
execSync(
  `ffmpeg -y -i /tmp/vibepkg-video-only.mp4 -i ${path.resolve(__dirname, "../public/bg-music.mp3")} -c:v copy -c:a aac -b:a 128k -t ${videoDuration} -shortest -map 0:v:0 -map 1:a:0 /mnt/documents/vibepkg-demo.mp4`,
  { stdio: "inherit" }
);

console.log("Done! Output: /mnt/documents/vibepkg-demo.mp4");
