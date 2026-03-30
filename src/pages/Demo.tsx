export default function Demo() {
  return (
    <div className="min-h-screen bg-[#1a1f2a] flex items-center justify-center p-5">
      <div className="max-w-[1100px] w-full flex flex-col items-center">
        <img
          src="https://spxdyqdygsmzyngrqxni.supabase.co/storage/v1/object/public/print-files/demo/vibe-logo-dark.png"
          alt="Vibe Packaging"
          className="h-28 md:h-36 w-auto mb-8"
        />
        <video
          controls
          autoPlay
          playsInline
          className="w-full rounded-xl shadow-2xl"
          src="https://spxdyqdygsmzyngrqxni.supabase.co/storage/v1/object/public/print-files/demo/vibepkg-demo.mp4"
        />
      </div>
    </div>
  );
}
