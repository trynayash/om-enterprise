import {
  BadgeCheck,
  Boxes,
  ChartColumn,
  FileText,
  Folder,
  Gauge,
  Globe,
  History,
  Package,
  Receipt,
  Settings,
  Shield,
  Store,
  Tags,
  Upload,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  store: Store,
  gauge: Gauge,
  receipt: Receipt,
  "badge-check": BadgeCheck,
  wallet: Wallet,
  "file-text": FileText,
  users: Users,
  globe: Globe,
  package: Package,
  folder: Folder,
  tags: Tags,
  upload: Upload,
  boxes: Boxes,
  chart: ChartColumn,
  shield: Shield,
  settings: Settings,
  history: History,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Gauge;
  return <Icon className={className} aria-hidden />;
}
