

## Plan: Fix Shipment Scene + Add ElevenLabs Music & Voiceover

### Problem
1. The shipment tracking scene relies on a bad AI-generated map image. It looks fake.
2. The background music is a single monotone sound, not real music.
3. ElevenLabs is now connected and should be used.

### Approach

#### 1. Rebuild ShipmentScene as Pure Code (no image)
Instead of relying on a generated map image, build the entire scene programmatically in React/Remotion:

- **SVG world map dots**: A subtle dotted world map background rendered as a grid of small circles (like a data visualization style map — not a realistic map)
- **Animated route arc**: An SVG path from Shenzhen to Long Beach that draws itself using `strokeDashoffset` driven by `interpolate()` — a green glowing line curving across the Pacific
- **Animated ship icon**: A small ship emoji/icon that moves along the route path, positioned at ~65% progress
- **Tracking info card** (left side, glass-morphism style):
  - "Shipment Tracking" header
  - Leg 1: International Freight — COSCO — In Transit
  - Leg 2: Customs Clearance — Pending
  - Leg 3: Domestic Delivery — FedEx — Pending
  - Progress bar showing 2/3 legs, 65% overall
  - Origin: Shenzhen, China → Destination: Long Beach, CA
  - ETA: Apr 14, 2026
- **Animated progress bar** that fills to 65% with a spring animation
- All coordinates simplified — just key points for visual storytelling

This approach eliminates the AI-generated image entirely and gives full control over the visual quality.

#### 2. Generate Real Music via ElevenLabs
- Call the `elevenlabs-music` edge function with a prompt like: "Upbeat modern corporate technology background music, clean and professional, light electronic beats with subtle synths"
- Duration: 65 seconds to cover the full video
- Save the result as `remotion/public/bg-music.mp3`

#### 3. Generate Voiceover via ElevenLabs TTS
- Write narration scripts for each scene (short, punchy, ~3-5 seconds each)
- Call `elevenlabs-tts` edge function for each scene's narration
- Concatenate or layer the VO clips into the final render using ffmpeg
- Use a professional voice (e.g. "George" or "Brian")

Scene scripts:
- Intro: "VibePKG — your complete packaging portal."
- Orders: "Create and manage orders with real-time visibility."
- Production: "Track every production stage from start to finish."
- Production Deep Dive: "Drill into stage details with photo updates."
- Artwork: "Manage artwork files, approvals, and version history."
- Invoices: "Generate invoices and track payments seamlessly."
- Print Workshop: "Design custom packaging right in your browser."
- Shipment: "Follow your shipment from factory to doorstep."
- Outro: "VibePKG — packaging, simplified."

#### 4. Updated Render Pipeline
- Render video muted as before
- Use ffmpeg to mix: video + bg music (lower volume) + voiceover track
- Output to `/mnt/documents/vibepkg-demo.mp4`

### Technical Details

**ShipmentScene.tsx** — entirely code-driven:
- SVG viewBox 1920x1080 for the background map dots
- Simplified continent outlines as dot clusters (no image dependency)
- `strokeDasharray` + `strokeDashoffset` animated via `interpolate(frame, ...)` for the route line
- Glass card with tracking legs styled like the real `ShipmentTracker` component (Ship/ShieldCheck/Truck icons as SVG)

**Audio pipeline** (in render script):
- Call edge functions via `fetch()` to generate music and TTS
- Write audio files to `remotion/public/`
- ffmpeg mix: `ffmpeg -i video.mp4 -i music.mp3 -i voiceover.mp3 -filter_complex "[1]volume=0.3[m];[2]volume=1.0[v];[m][v]amix=inputs=2" -map 0:v -c:v copy output.mp4`

### Files to Change
- `remotion/src/scenes/ShipmentScene.tsx` — full rewrite, pure code, no image
- `remotion/scripts/render-remotion.mjs` — add audio generation + mixing steps
- `remotion/public/bg-music.mp3` — replaced with ElevenLabs-generated music

