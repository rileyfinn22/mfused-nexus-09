export default function Demo() {
  return (
    <div className="min-h-screen bg-[#1a1f2a] flex items-center justify-center p-5">
      <div className="max-w-[1100px] w-full text-center">
        <h1 className="text-[#b8cf68] text-2xl font-semibold mb-4">
          Vibe Packaging — Your Complete Packaging Portal
        </h1>
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
