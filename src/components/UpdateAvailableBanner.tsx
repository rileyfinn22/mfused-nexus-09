import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A tab opened before a deploy keeps running the old code (including old save logic)
 * until it is reloaded. Compare the loaded entry script with the one the server now
 * serves and ask the user to reload when they differ.
 */
const entryOf = (html: string) => html.match(/\/assets\/index-[\w-]+\.js/)?.[0] ?? null;

const loadedEntry = () =>
  Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
    .map((s) => entryOf(s.src))
    .find(Boolean) ?? null;

export function UpdateAvailableBanner() {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const current = loadedEntry();
    if (!current) return;
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/?v=${Date.now()}`, { cache: "no-store" });
        const latest = entryOf(await res.text());
        if (latest && latest !== current) setOutdated(true);
      } catch {
        /* offline: try again later */
      }
    };
    const timer = setInterval(check, 2 * 60 * 1000);
    window.addEventListener("focus", check);
    check();
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!outdated) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex flex-wrap items-center justify-center gap-3 border-t bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg">
      <span>The portal was updated. Reload this page before saving so your changes save correctly.</span>
      <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
        <RefreshCw className="mr-2 h-4 w-4" /> Reload now
      </Button>
    </div>
  );
}
