/** P7 A (P7-AC1b) — draft screenshot helpers: data: only, quota keeps image in holder. */
import { describe, it, expect, beforeEach } from "vitest";
import {
  isDataImageUrl, sanitizeDraftScreenshot, writeDrawerDraft, clearDrawerDraft,
  getHeldScreenshot, setHeldScreenshot, clearHeldScreenshot, drawerDraftKey, removeDraftScreenshot,
} from "@/lib/draftScreenshotHolder";

const IMG = "data:image/webp;base64,AAAA";

function store(quotaOver = Infinity) {
  const data = new Map<string, string>();
  return {
    data,
    setItem(k: string, v: string) {
      if (v.length > quotaOver) {
        const e = new Error("quota"); (e as { name: string }).name = "QuotaExceededError"; throw e;
      }
      data.set(k, v);
    },
    removeItem(k: string) { data.delete(k); },
  };
}

beforeEach(() => clearHeldScreenshot("a1"));

describe("isDataImageUrl / sanitize", () => {
  it("accepts only data:image/ strings", () => {
    expect(isDataImageUrl(IMG)).toBe(true);
    for (const bad of ["https://x.supabase.co/storage/v1/object/sign/a.webp?token=1", "http://x/a.png", "blob:http://x/1", "data:text/html,<b>", "", null, 5]) {
      expect(isDataImageUrl(bad)).toBe(false);
      expect(sanitizeDraftScreenshot(bad)).toBeNull();
    }
  });
});

describe("writeDrawerDraft", () => {
  it("persists a data: image in the draft", () => {
    const s = store();
    expect(writeDrawerDraft("a1", { notes: "x", screenshot: IMG }, s)).toBe("ok");
    expect(JSON.parse(s.data.get(drawerDraftKey("a1"))!).screenshot).toBe(IMG);
  });
  it("never persists a non-data: screenshot (signed URL dropped)", () => {
    const s = store();
    writeDrawerDraft("a1", { notes: "x", screenshot: "https://signed.example/a.webp?token=secret" }, s);
    const raw = s.data.get(drawerDraftKey("a1"))!;
    expect(JSON.parse(raw).screenshot).toBeNull();
    expect(raw).not.toContain("https://");
  });
  it("screenshot-quota-keeps-image: quota -> holder keeps image, text part saved", () => {
    const s = store(200);
    expect(writeDrawerDraft("a1", { notes: "text-kept", screenshot: IMG + "A".repeat(500) }, s)).toBe("quota-image-kept");
    expect(getHeldScreenshot("a1")).toMatch(/^data:image\//);
    const saved = JSON.parse(s.data.get(drawerDraftKey("a1"))!);
    expect(saved.notes).toBe("text-kept");
    expect(saved.screenshot).toBeNull();
  });
  it("non-quota failures return failed and hold nothing", () => {
    const s = { setItem: () => { throw new Error("SecurityError"); } };
    expect(writeDrawerDraft("a1", { screenshot: IMG }, s)).toBe("failed");
    expect(getHeldScreenshot("a1")).toBeNull();
  });
  it("clearDrawerDraft removes draft and holder", () => {
    const s = store();
    writeDrawerDraft("a1", { notes: "x" }, s);
    setHeldScreenshot("a1", IMG);
    clearDrawerDraft("a1", s);
    expect(s.data.size).toBe(0);
    expect(getHeldScreenshot("a1")).toBeNull();
  });
  it("holder refuses non-data: values", () => {
    setHeldScreenshot("a1", "https://x/a.png");
    expect(getHeldScreenshot("a1")).toBeNull();
  });
});

describe("review E17 m5: quota status + explicit removal", () => {
  it("reports quota-image-kept-text-failed when the text retry also fails", () => {
    const s = store(0); // every write throws QuotaExceededError
    expect(writeDrawerDraft("a1", { notes: "t", screenshot: IMG }, s)).toBe("quota-image-kept-text-failed");
    expect(getHeldScreenshot("a1")).toBe(IMG);
    expect(s.data.get(drawerDraftKey("a1"))).toBeUndefined();
  });

  it("removeDraftScreenshot drops the stored image and the held copy, keeps the text", () => {
    const s = { ...store(), getItem(k: string) { return this.data.get(k) ?? null; } };
    s.data.set(drawerDraftKey("a1"), JSON.stringify({ notes: "keep", screenshot: IMG }));
    setHeldScreenshot("a1", IMG);
    removeDraftScreenshot("a1", s);
    const saved = JSON.parse(s.data.get(drawerDraftKey("a1"))!);
    expect(saved.screenshot).toBeNull();
    expect(saved.notes).toBe("keep");
    expect(getHeldScreenshot("a1")).toBeNull();
  });

  it("removeDraftScreenshot tolerates a missing or corrupt draft", () => {
    const s = { ...store(), getItem(k: string) { return this.data.get(k) ?? null; } };
    expect(() => removeDraftScreenshot("a1", s)).not.toThrow();
    s.data.set(drawerDraftKey("a1"), "{not json");
    expect(() => removeDraftScreenshot("a1", s)).not.toThrow();
    expect(() => removeDraftScreenshot("a1", null)).not.toThrow();
  });
});
