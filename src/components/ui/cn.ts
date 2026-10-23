import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge, taught the custom theme names from globals.css `@theme`. */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ["card", "lift"],
      animate: ["fade-in", "rise", "sheet-in", "slide-in"],
      ease: ["out-quart", "in-out-quart"],
    },
  },
});

/** Join class names, skipping falsy values. A later Tailwind class overrides an earlier one of the same kind. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return merge(...parts);
}
