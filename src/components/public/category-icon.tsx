import { Bath, BrickWall, Container, Droplets, Package, PaintBucket, Spline, Wrench } from "lucide-react";
import { cn } from "@/components/ui/cn";

/** Icon for a category's `icon` key (paint, tank, bath, pipe, drain, wrench, brick). */
export function CategoryIcon({ name, className, strokeWidth }: { name: string | null | undefined; className?: string; strokeWidth?: number }) {
  const props = { className, strokeWidth, "aria-hidden": true as const };
  switch (name) {
    case "paint":
      return <PaintBucket {...props} />;
    case "tank":
      return <Container {...props} />;
    case "bath":
      return <Bath {...props} />;
    case "pipe":
      return <Spline {...props} />;
    case "drain":
      return <Droplets {...props} />;
    case "wrench":
      return <Wrench {...props} />;
    case "brick":
      return <BrickWall {...props} />;
    default:
      return <Package {...props} />;
  }
}

/** Decorative placeholder used when a product has no photo (no stock imagery is used). */
export function ProductArt({ icon, className, label, large }: { icon: string | null | undefined; className?: string; label?: string; large?: boolean }) {
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-navy-50 via-white to-gold-50", className)}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(201 214 234 / 0.55) 1px, transparent 1px), linear-gradient(to bottom, rgb(201 214 234 / 0.55) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div aria-hidden className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-gold-200/40 blur-2xl" />
      <div
        className={cn(
          "relative flex items-center justify-center rounded-3xl bg-white/95 shadow-card ring-1 ring-navy-100",
          large ? "h-32 w-32" : "h-20 w-20",
        )}
      >
        <CategoryIcon name={icon} className={cn("text-navy-700", large ? "h-16 w-16" : "h-10 w-10")} strokeWidth={1.5} />
        <span className={cn("absolute rounded-full bg-gold-500 ring-4 ring-white", large ? "-right-2 -top-2 h-6 w-6" : "-right-1.5 -top-1.5 h-4 w-4")} />
      </div>
    </div>
  );
}
