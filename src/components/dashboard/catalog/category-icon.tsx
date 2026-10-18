import { Bath, BrickWall, Folder, PaintBucket, Cylinder, Waves, Wrench, type LucideIcon } from "lucide-react";

export const CATEGORY_ICONS: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: "paint", label: "Paint", Icon: PaintBucket },
  { value: "tank", label: "Water tank", Icon: Cylinder },
  { value: "bath", label: "Bathware", Icon: Bath },
  { value: "pipe", label: "Pipes", Icon: Waves },
  { value: "drain", label: "Drainage", Icon: Waves },
  { value: "wrench", label: "Tools / accessories", Icon: Wrench },
  { value: "brick", label: "Building materials", Icon: BrickWall },
];

export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = CATEGORY_ICONS.find((i) => i.value === name)?.Icon ?? Folder;
  return <Icon className={className} aria-hidden />;
}
