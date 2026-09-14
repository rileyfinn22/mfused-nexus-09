/** Public, unauthenticated page — every asset here must live in a PUBLIC bucket.
 *  These used to point at `print-files`, which is private, so both requests came
 *  back 400 and the page rendered as an empty dark screen. Signed URLs are not an
 *  option: there is no session on this route to sign with. */
const DEMO_ASSET_BASE =
  "https://spxdyqdygsmzyngrqxni.supabase.co/storage/v1/object/public/demo-assets";

export default function Demo() {
  return (
    <div className="min-h-screen bg-[#1a1f2a] flex items-center justify-center p-5">
      <div className="max-w-[1100px] w-full flex flex-col items-center">
        <img
          src={`${DEMO_ASSET_BASE}/demo/vibe-logo-dark.png`}
          alt="Vibe Packaging"
          className="h-28 md:h-36 w-auto mb-8"
        />
        <video
          controls
          autoPlay
          playsInline
          className="w-full rounded-xl shadow-2xl"
          src={`${DEMO_ASSET_BASE}/demo/vibepkg-demo.mp4`}
        />
      </div>
    </div>
  );
}
