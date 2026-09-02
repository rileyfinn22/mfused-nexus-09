import { Loader2 } from "lucide-react";
import { useActiveCompany } from "@/hooks/useActiveCompany";
import CreateOrder from "./CreateOrder";
import PlaceOrder from "./PlaceOrder";

// /orders/create is role-aware. VibePKG staff get the full internal order builder
// (vendors, costs, PO import, drafts); buyers get the narrow submit-only form.
// Routing here rather than at the button keeps direct URL navigation gated too.
export default function NewOrder() {
  const { isVibeAdmin, loading } = useActiveCompany();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return isVibeAdmin ? <CreateOrder /> : <PlaceOrder />;
}
