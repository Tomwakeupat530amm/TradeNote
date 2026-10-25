/**
 * Shared component-test helpers (hardening P4, D-10 / E-2).
 *
 * - `globals: false` means RTL does not auto-register cleanup: importing this module registers an
 *   explicit `afterEach(cleanup)` and the jest-dom matchers.
 * - Mock factories for next-intl, sonner and framer-motion are used from each test file's
 *   `vi.mock(...)` (vi.mock is hoisted per file, so the factories live here and the calls live there).
 * - Each component test file must start with `// @vitest-environment jsdom`.
 */
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createElement, forwardRef, Fragment, type ReactNode } from "react";

afterEach(() => {
  cleanup();
});

type Values = Record<string, unknown>;

/** Translator that returns `Namespace.key` (or the defaultMessage when one is passed). */
function makeTranslator(namespace?: string) {
  const resolve = (key: string, values?: Values) => {
    const dm = values && typeof values.defaultMessage === "string" ? (values.defaultMessage as string) : null;
    return dm ?? (namespace ? `${namespace}.${key}` : key);
  };
  const t = ((key: string, values?: Values) => resolve(key, values)) as ((key: string, values?: Values) => string) & {
    rich: (key: string, values?: Values) => string;
    markup: (key: string, values?: Values) => string;
    raw: (key: string) => string;
    has: (key: string) => boolean;
  };
  t.rich = (key, values) => resolve(key, values);
  t.markup = (key, values) => resolve(key, values);
  t.raw = (key) => resolve(key);
  t.has = () => false;
  return t;
}

/** `vi.mock("next-intl", () => nextIntlMock())` */
export function nextIntlMock() {
  return {
    useTranslations: (namespace?: string) => makeTranslator(namespace),
    useLocale: () => "en",
    useFormatter: () => ({
      number: (n: number) => String(n),
      dateTime: (d: Date) => d.toISOString(),
      relativeTime: (d: Date) => d.toISOString(),
    }),
    NextIntlClientProvider: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
  };
}

export interface ToastSpy {
  (...args: unknown[]): unknown;
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warning: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  message: ReturnType<typeof vi.fn>;
  dismiss: ReturnType<typeof vi.fn>;
}

/** `vi.mock("sonner", () => sonnerMock(toastSpy))` — pass a hoisted spy object to assert on toasts. */
export function createToastSpy(): ToastSpy {
  const fn = vi.fn() as unknown as ToastSpy;
  fn.success = vi.fn();
  fn.error = vi.fn();
  fn.warning = vi.fn();
  fn.info = vi.fn();
  fn.message = vi.fn();
  fn.dismiss = vi.fn();
  return fn;
}

export function sonnerMock(toast: ToastSpy = createToastSpy()) {
  return { toast, Toaster: () => null };
}

const MOTION_ONLY_PROPS = new Set([
  "initial", "animate", "exit", "transition", "variants", "whileHover", "whileTap", "whileFocus",
  "whileInView", "whileDrag", "layout", "layoutId", "drag", "dragConstraints", "onAnimationComplete",
  "onAnimationStart", "custom",
]);

/** `vi.mock("framer-motion", () => framerMotionMock())` — renders plain DOM elements, no animation. */
export function framerMotionMock() {
  const cache = new Map<string, unknown>();
  const motion = new Proxy(
    {},
    {
      get(_target, tag: string) {
        if (!cache.has(tag)) {
          const Comp = forwardRef<unknown, Record<string, unknown>>((props, ref) => {
            const clean: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(props)) if (!MOTION_ONLY_PROPS.has(k)) clean[k] = v;
            return createElement(tag, { ...clean, ref });
          });
          Comp.displayName = `motion.${tag}`;
          cache.set(tag, Comp);
        }
        return cache.get(tag);
      },
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
    useReducedMotion: () => true,
  };
}

/** jsdom gaps used by the app's components: matchMedia, ResizeObserver, IntersectionObserver, scrollTo. */
export function installDomStubs(): void {
  if (typeof window === "undefined") return;
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.ResizeObserver) g.ResizeObserver = NoopObserver;
  if (!g.IntersectionObserver) g.IntersectionObserver = NoopObserver;
  if (!window.scrollTo) window.scrollTo = (() => {}) as typeof window.scrollTo;
}
