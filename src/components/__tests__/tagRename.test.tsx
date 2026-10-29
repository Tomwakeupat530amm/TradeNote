// @vitest-environment jsdom
/**
 * P6 D3 (tag-rename-new-only, UI side): shared matcher, rename dialog (count, disabled until loaded,
 * cancel does not save) and EN/VI wording that names the active-account scope.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import "@/test-utils/componentMocks";
import { matchesPlaybook, normalizePlaybookName, tradesForPlaybook, isPlaybookRename } from "@/lib/playbookMatch";
import { PlaybookRenameDialog } from "@/components/PlaybookRenameDialog";

// Translator that renders values, so the count is visible in the DOM.
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, values?: Record<string, unknown>) =>
    `${ns}.${key}` + (values ? ` ${JSON.stringify(values)}` : ""),
}));

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.resolve(ROOT, rel), "utf8");

describe("shared playbook matcher (D1)", () => {
  it("matches with trim + lowercase, empty never matches", () => {
    expect(normalizePlaybookName("  BreakOut ")).toBe("breakout");
    expect(matchesPlaybook(" breakout", "Breakout ")).toBe(true);
    expect(matchesPlaybook("Breakout v2", "Breakout")).toBe(false);
    expect(matchesPlaybook("", "")).toBe(false);
    expect(matchesPlaybook(null, "x")).toBe(false);
  });
  it("counts old trades and detects a real rename", () => {
    const trades = [{ setup: "Breakout" }, { setup: " breakout " }, { setup: "ORB" }, { setup: null }];
    expect(tradesForPlaybook(trades, "BREAKOUT")).toHaveLength(2);
    expect(isPlaybookRename("Breakout", " breakout ")).toBe(false);
    expect(isPlaybookRename("Breakout", "Breakout v2")).toBe(true);
  });
  it("playbook page uses the shared matcher for edge stats and the rename count (no inline duplicate)", () => {
    const src = read("src/app/[locale]/playbook/page.tsx");
    expect(src).toMatch(/from "@\/lib\/playbookMatch"/);
    expect(src).not.toMatch(/setup\.trim\(\)\.toLowerCase\(\)/);
    expect((src.match(/tradesForPlaybook\(accountTrades/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/ready=\{historyReady\}/);
    expect(src).toMatch(/useHistoryReady\(\)/);
    expect(src).not.toMatch(/from\(['"]trades['"]\)/);
  });
});

describe("PlaybookRenameDialog (D2)", () => {
  const base = { oldTitle: "Breakout", newTitle: "Breakout v2", count: 7 };
  it("shows the old-trade count and confirms when the history is loaded", () => {
    const onConfirm = vi.fn();
    render(<PlaybookRenameDialog {...base} ready onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(screen.getByTestId("playbook-rename-body").textContent).toContain('"count":7');
    const btn = screen.getByTestId("playbook-rename-confirm");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
  it("disables confirm and shows the loading text until the full history is loaded", () => {
    const onConfirm = vi.fn();
    render(<PlaybookRenameDialog {...base} ready={false} onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(screen.getByTestId("playbook-rename-confirm")).toBeDisabled();
    expect(screen.getByTestId("playbook-rename-body").textContent).toContain("Playbook.renameNewOnlyLoading");
    fireEvent.click(screen.getByTestId("playbook-rename-confirm"));
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it("cancel calls onCancel and never onConfirm (nothing saved)", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<PlaybookRenameDialog {...base} ready onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("playbook-rename-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("rename wording EN/VI (S7)", () => {
  it("names the active-account scope and uses {count}", () => {
    const en = JSON.parse(read("messages/en.json")).Playbook;
    const vi_ = JSON.parse(read("messages/vi.json")).Playbook;
    for (const k of ["renameNewOnlyTitle", "renameNewOnlyBody", "renameNewOnlyLoading", "renameNewOnlyConfirm"]) {
      expect(en[k]).toBeTruthy();
      expect(vi_[k]).toBeTruthy();
    }
    expect(en.renameNewOnlyBody).toContain("in the active account");
    expect(vi_.renameNewOnlyBody).toContain("trong tài khoản đang chọn");
    expect(en.renameNewOnlyBody).toContain("{count}");
    expect(vi_.renameNewOnlyBody).toContain("{count}");
  });
});
