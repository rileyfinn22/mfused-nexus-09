import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── ElevenLabs Audio Generation ──────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

async function generateMusic() {
  console.log("Generating background music via ElevenLabs...");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-music`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      prompt: "Upbeat modern corporate technology background music, clean and professional, light electronic beats with subtle synths and warm pads, inspiring and forward-looking mood, moderate tempo",
      duration: 65,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Music generation failed (${res.status}): ${err}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const outPath = path.resolve(__dirname, "../public/bg-music.mp3");
  fs.writeFileSync(outPath, buf);
  console.log(`Music saved: ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`);
}

async function generateTTS(text, outFile) {
  console.log(`  TTS: "${text.substring(0, 50)}..."`);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      text,
      voiceId: "JBFqnCBsd6RMkjVDRZzb", // George - professional male
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS failed (${res.status}): ${err}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outFile, buf);
  console.log(`  Saved: ${outFile} (${(buf.length / 1024).toFixed(0)} KB)`);
}

// Scene voiceover scripts with timing (frame offsets at 30fps)
// Scenes: Intro(300) Orders(310) Production(340) ProdDeep(340) Artwork(310) Invoices(290) PrintWS(290) Shipment(310) Outro(290)
// Cumulative starts (minus 20f transitions): 0, 280, 570, 890, 1210, 1500, 1770, 2040, 2330
const VO_SCENES = [
  { text: "Vibe Packaging... your complete packaging portal. Full visibility into every order, from artwork approval, to production tracking, to delivery.", startFrame: 40 },
  { text: "Create and manage customer orders with real-time visibility across your entire supply chain. Every line item, every shipment, all in one place.", startFrame: 300 },
  { text: "Track every production stage from start to finish. See exactly where each order stands, with detailed stage-by-stage progress.", startFrame: 600 },
  { text: "Drill into individual stages with photo updates, notes, and real-time progress tracking from Vibe's production teams.", startFrame: 920 },
  { text: "Manage all your artwork files, approvals, and version history in one centralized hub. No more digging through emails.", startFrame: 1240 },
  { text: "Generate professional invoices, track payments, and keep your accounts receivable organized and up to date.", startFrame: 1530 },
  { text: "Design custom packaging labels and inserts right in your browser with the built-in Print Workshop.", startFrame: 1800 },
  { text: "Follow your shipment from factory to doorstep. Live tracking with vessel info, customs status, and delivery ETAs.", startFrame: 2070 },
  { text: "Vibe Packaging... total transparency, zero guesswork. Visit Vibepkg.com to learn more.", startFrame: 2360 },
];

async function generateAllVO() {
  console.log("Generating voiceover clips...");
  const voDir = path.resolve(__dirname, "../public/vo");
  fs.mkdirSync(voDir, { recursive: true });

  for (let i = 0; i < VO_SCENES.length; i++) {
    const outFile = path.join(voDir, `vo-${i}.mp3`);
    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 1000) {
      console.log(`  Skipping vo-${i}.mp3 (already exists)`);
      continue;
    }
    await generateTTS(VO_SCENES[i].text, outFile);
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }
  return voDir;
}

function buildVOTrack(voDir, totalDuration, fps) {
  // Concatenate VO clips with silence gaps using ffmpeg
  const filterParts = [];
  const inputs = [];

  for (let i = 0; i < VO_SCENES.length; i++) {
    const voFile = path.join(voDir, `vo-${i}.mp3`);
    if (!fs.existsSync(voFile)) continue;
    inputs.push(`-i "${voFile}"`);
    const delaySec = (VO_SCENES[i].startFrame / fps).toFixed(3);
    const idx = inputs.length - 1;
    filterParts.push(`[${idx}]adelay=${Math.round(delaySec * 1000)}|${Math.round(delaySec * 1000)}[v${i}]`);
  }

  if (inputs.length === 0) return null;

  const mixInputs = filterParts.map((_, i) => `[v${i}]`).join("");
  const filter = filterParts.join(";") + `;${mixInputs}amix=inputs=${inputs.length}:dropout_transition=0:normalize=0[voout]`;

  const voTrack = "/tmp/voiceover-track.mp3";
  const cmd = `ffmpeg -y ${inputs.join(" ")} -filter_complex "${filter}" -map "[voout]" -t ${totalDuration} -ac 2 -ar 44100 "${voTrack}"`;
  console.log("Building voiceover track...");
  execSync(cmd, { stdio: "inherit" });
  return voTrack;
}

// ── Main Pipeline ────────────────────────────────────────────────────────

// Step 1: Generate audio assets
try {
  await generateMusic();
} catch (e) {
  console.warn("Music generation failed, using existing file:", e.message);
}

let voDir;
try {
  voDir = await generateAllVO();
} catch (e) {
  console.warn("Voiceover generation failed:", e.message);
}

// Step 2: Bundle and render video
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

// Step 3: Mix audio
const videoDuration = composition.durationInFrames / composition.fps;
const musicPath = path.resolve(__dirname, "../public/bg-music.mp3");

// Build voiceover composite track
let voTrack = null;
if (voDir) {
  try {
    voTrack = buildVOTrack(voDir, videoDuration, composition.fps);
  } catch (e) {
    console.warn("VO track build failed:", e.message);
  }
}

if (voTrack && fs.existsSync(voTrack)) {
  // Mix: video + music (quiet) + voiceover
  console.log("Muxing video + music + voiceover...");
  execSync(
    `ffmpeg -y -i /tmp/vibepkg-video-only.mp4 -i "${musicPath}" -i "${voTrack}" ` +
    `-filter_complex "[1]volume=0.18[m];[2]volume=0.9[v];[m][v]amix=inputs=2:dropout_transition=0:normalize=0[aout]" ` +
    `-map 0:v:0 -map "[aout]" -c:v copy -c:a aac -b:a 192k -t ${videoDuration} -shortest /mnt/documents/vibepkg-demo.mp4`,
    { stdio: "inherit" }
  );
} else {
  // Fallback: video + music only
  console.log("Muxing video + music...");
  execSync(
    `ffmpeg -y -i /tmp/vibepkg-video-only.mp4 -i "${musicPath}" -c:v copy -c:a aac -b:a 128k -t ${videoDuration} -shortest -map 0:v:0 -map 1:a:0 /mnt/documents/vibepkg-demo.mp4`,
    { stdio: "inherit" }
  );
}

console.log("Done! Output: /mnt/documents/vibepkg-demo.mp4");
