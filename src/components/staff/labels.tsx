import { Badge } from "@/components/ui/badge";

/** What a sale without a named customer is called everywhere on the staff side. */
export const CASH_SALE = "Cash sale";

/**
 * Marks a training (sample) sale, payment or document in a list. Amber, not red: a training sale is
 * routine practice, not an error. The in-sale "TRAINING SALE" stamp stays red on purpose.
 */
export function TrainingBadge({ label = "Training", className }: { label?: string; className?: string }) {
  return (
    <Badge tone="amber" className={className}>
      {label}
    </Badge>
  );
}

const CONTACT: Record<string, string> = { whatsapp: "Prefers WhatsApp", call: "Prefers a phone call", email: "Prefers email" };

/** "whatsapp" → "Prefers WhatsApp". */
export function preferredContactLabel(v: string | null | undefined): string | null {
  return v ? (CONTACT[v] ?? `Prefers ${v}`) : null;
}

const ROLE_NAME: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", sales: "Sales & Operations", accountant: "Accountant / Auditor" };

/** Who did something, as saved in the audit trail; older entries carry the role key ("Kishan (super_admin)"). */
export function actorLabel(label: string): string {
  return label.replace(/\(([a-z_]+)\)$/, (whole, key: string) => (ROLE_NAME[key] ? `(${ROLE_NAME[key]})` : whole));
}

/** `plural(1, "line")` → "1 line"; `plural(6, "line")` → "6 lines". */
export function plural(n: number | string, singular: string, many = `${singular}s`): string {
  const count = Number(n);
  return `${count.toLocaleString("en-IN")} ${count === 1 ? singular : many}`;
}
