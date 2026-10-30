import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Class merger for `src/components/ui/**`.
 * Bare `twMerge` treats the custom `text-data` / `text-label` font-size tokens as colours and drops
 * them next to `text-ink*`; registering them in the `font-size` group keeps both classes.
 */
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["data", "label"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
