import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

/** Only an in-app path may be a return target — never "//host" or "https://…". */
export const safeReturnTo = (value: string | null | undefined): string | null =>
  value && value.startsWith("/") && !value.startsWith("//") ? value : null;

/** The `?returnTo=` of the current page, when it names an in-app path. */
export function useReturnTo(): string | null {
  const { search } = useLocation();
  return safeReturnTo(new URLSearchParams(search).get("returnTo"));
}

/** Appends `?returnTo=<from>` so the destination's Back button comes back to `from`. */
export const withReturnTo = (path: string, from: string) =>
  `${path}${path.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(from)}`;

const RETURN_LABELS: [prefix: string, label: string][] = [
  ["/projects/", "Back to Project"],
  ["/invoices/", "Back to Invoice"],
  ["/orders/", "Back to Order"],
  ["/vendor-status", "Back to Vendor Status"],
  ["/production", "Back to Production"],
  ["/vendor-pos", "Back to Vendor POs"],
];

export const returnToLabel = (path: string) =>
  RETURN_LABELS.find(([prefix]) => path.startsWith(prefix))?.[1] ?? "Back";

interface BackButtonProps {
  /** Where Back goes when the page was not opened with `?returnTo=`. */
  to: string;
  /** e.g. "Back to Orders". */
  label?: string;
  /** Editors pass true so they drop out of browser history once left. */
  replace?: boolean;
  className?: string;
}

/**
 * The one Back button. It always goes to a fixed destination — the list the record
 * belongs to, or the page named by `?returnTo=` — never history(-1), which lands on
 * whatever happened to come before (an editor, a sibling record, another tab).
 * List pages remember their own filters (see useListFilters), so a bare list path
 * restores where the user was.
 */
export function BackButton({ to, label = "Back", replace = false, className }: BackButtonProps) {
  const navigate = useNavigate();
  const returnTo = useReturnTo();
  const target = returnTo ?? to;
  const text = returnTo ? returnToLabel(returnTo) : label;
  return (
    <Button variant="ghost" size="sm" className={className} onClick={() => navigate(target, { replace })}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      {text}
    </Button>
  );
}

export default BackButton;
