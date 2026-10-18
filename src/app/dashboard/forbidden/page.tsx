import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/page";
import { LinkButton } from "@/components/ui/button";

export const metadata = { title: "Not permitted" };

export default function Forbidden() {
  return (
    <EmptyState
      icon={<ShieldAlert className="h-10 w-10" />}
      title="You don't have access to this page"
      description="Your account doesn't include this permission. Ask the Super Admin if you need it."
      action={<LinkButton href="/pos">Go to Point of Sale</LinkButton>}
    />
  );
}
