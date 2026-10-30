// P7 C5: repo_hygiene_check.mjs pure checks (mutation target for P7-M6 / P7-M7).
import { describe, expect, it } from "vitest";
import * as hygiene from "../../../scripts/repo_hygiene_check.mjs";

const h = hygiene as {
  secretReason: (v: string) => string | null;
  checkEnvTemplate: (t: string | undefined) => string[];
  checkGitignore: (t: string | undefined) => string[];
  checkGitattributes: (t: string | undefined) => string[];
  findCrlf: (f: { path: string; content: string | Buffer }[]) => string[];
  runSelfTest: () => { name: string; ok: boolean }[];
  runRepoChecks: () => { name: string; errors: string[] }[];
};

const CLEAN = [
  "NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key",
  "SUPABASE_URL=",
  "SUPABASE_ANON_KEY=",
  "OPENROUTER_API_KEY=<key>",
  "OPENROUTER_MODEL=",
  "# PROD_DB_URL=postgresql://user:password@host:5432/postgres",
  "# PG_MODULE_PATH=<path>",
].join("\n");

describe("repo_hygiene_check secret detection", () => {
  it("accepts empty values and placeholders", () => {
    for (const v of ["", "your-key", "<x>", "changeme", "https://your-project-ref.supabase.co", "openai/gpt-4o-mini"]) {
      expect(h.secretReason(v)).toBeNull();
    }
    expect(h.checkEnvTemplate(CLEAN)).toEqual([]);
  });

  it("rejects JWT-like, password URLs, sk- keys, long random tokens", () => {
    const fakeJwt = ["eyJmYWtlIjoiZml4dHVyZSJ9", "ZmFrZQ", "c2ln"].join(".");
    expect(h.secretReason(fakeJwt)).toMatch(/JWT/);
    expect(h.secretReason("postgresql://postgres:Xq7fakePw9@db.host.test:5432/postgres")).toMatch(/password/);
    expect(h.secretReason("sk-" + "a1B2c3D4e5F6g7H8i9J0")).toMatch(/API key/);
    expect(h.secretReason("Q2hhbmdlTWVQbGVhc2VOb3RSZWFsVG9rZW4")).toMatch(/random/);
    expect(h.checkEnvTemplate(CLEAN.replace("your-supabase-anon-key", fakeJwt)).length).toBeGreaterThan(0);
  });

  it("requires every used key and rejects unknown keys / missing file", () => {
    expect(h.checkEnvTemplate(CLEAN.replace("OPENROUTER_MODEL=", ""))).toContain("missing active key OPENROUTER_MODEL");
    expect(h.checkEnvTemplate(CLEAN + "\nSTRAY_KEY=")).toContain("unknown key STRAY_KEY (not used by src/ or scripts/)");
    expect(h.checkEnvTemplate(undefined).length).toBe(1);
  });
});

describe("repo_hygiene_check gitignore / gitattributes / CRLF", () => {
  it("requires .env* AND the template negation", () => {
    expect(h.checkGitignore(".env*\n!.env.example\n")).toEqual([]);
    expect(h.checkGitignore(".env*\n")).toHaveLength(1);
    expect(h.checkGitignore("!.env.example\n")).toHaveLength(1);
  });

  it("requires eol=lf", () => {
    expect(h.checkGitattributes("* text=auto eol=lf\n")).toEqual([]);
    expect(h.checkGitattributes("* text=auto\n")).toHaveLength(1);
  });

  it("detects CRLF only where present", () => {
    expect(h.findCrlf([{ path: "a", content: "x\ny\n" }, { path: "b", content: Buffer.from("x\r\ny") }])).toEqual(["b"]);
  });

  it("self-test fixtures all behave as expected and the real repo is clean", () => {
    expect(h.runSelfTest().filter((c) => !c.ok)).toEqual([]);
    expect(h.runRepoChecks().filter((r) => r.errors.length)).toEqual([]);
  });
});
