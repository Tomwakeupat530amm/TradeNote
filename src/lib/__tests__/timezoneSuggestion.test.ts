import { describe, it, expect } from "vitest";
import { shouldSuggestTimezone, dismissedKey } from "@/lib/timezoneSuggestion";

describe("shouldSuggestTimezone (L4-AC1)", () => {
  it("UTC saved + different valid browser zone + not dismissed => true", () => {
    expect(shouldSuggestTimezone("UTC", "Asia/Ho_Chi_Minh", null)).toBe(true);
  });
  it("saved zone is not UTC => false", () => {
    expect(shouldSuggestTimezone("America/New_York", "Asia/Ho_Chi_Minh", null)).toBe(false);
    expect(shouldSuggestTimezone(null, "Asia/Ho_Chi_Minh", null)).toBe(false);
  });
  it("browser zone is UTC => false", () => {
    expect(shouldSuggestTimezone("UTC", "UTC", null)).toBe(false);
  });
  it("invalid or missing browser zone => false", () => {
    expect(shouldSuggestTimezone("UTC", "Not/AZone", null)).toBe(false);
    expect(shouldSuggestTimezone("UTC", "", null)).toBe(false);
    expect(shouldSuggestTimezone("UTC", null, null)).toBe(false);
  });
  it("dismissed equals the browser zone => false", () => {
    expect(shouldSuggestTimezone("UTC", "Asia/Tokyo", "Asia/Tokyo")).toBe(false);
  });
  it("dismissed a different zone than the current browser zone => true", () => {
    expect(shouldSuggestTimezone("UTC", "Asia/Tokyo", "Europe/Berlin")).toBe(true);
  });
  it("dismissed key is per user", () => {
    expect(dismissedKey("u1")).toBe("tz_suggestion_dismissed_v1:u1");
  });
});
