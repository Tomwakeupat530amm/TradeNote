/**
 * Guest demo mode - in-memory PostgREST-like database (phase G1, step S0-2).
 *
 * `createFakeDb(initialTables, opts)` returns `{ from, snapshot, replaceAll }`. `from(table)`
 * gives a thenable query builder covering the supabase-js surface the app uses. Builders never
 * throw: every problem resolves to `{ data: null, error: FakeError }`. A statement is atomic:
 * on any error nothing is written. No network access of any kind lives in this file.
 */
import { TABLE_SCHEMA } from "./tableSchema";
import {
  GUEST_TABLE_NAMES,
  type ColumnSpec,
  type CreateFakeDbOptions,
  type FakeDb,
  type FakeError,
  type FakeQueryBuilder,
  type FakeResult,
  type GuestRow,
  type GuestTableName,
  type GuestTables,
  type OrderOptions,
  type SelectOptions,
  type TableSpec,
  type UpsertOptions,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StoredRow = { seq: number; row: GuestRow };
type Store = Record<GuestTableName, StoredRow[]>;

function fakeError(code: string, message: string, details: string | null = null): FakeError {
  return { code, message, details, hint: null };
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function isTableName(name: string): name is GuestTableName {
  return (GUEST_TABLE_NAMES as readonly string[]).includes(name);
}

function fallbackUuid(): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[8 + Math.floor(Math.random() * 4)];
    else out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

function defaultUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : fallbackUuid();
}

function defaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Calendar date (YYYY-MM-DD) of `instant` in `timeZone`. */
function dateInZone(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/** Value normalised for storage, or an error when it cannot be cast to the column kind. */
function normalize(spec: ColumnSpec, value: unknown): { ok: true; value: unknown } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value: null };
  switch (spec.kind) {
    case "timestamptz": {
      const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
      return Number.isNaN(ms) ? { ok: false } : { ok: true, value: new Date(ms).toISOString() };
    }
    case "date": {
      const s = String(value);
      return /^\d{4}-\d{2}-\d{2}/.test(s) ? { ok: true, value: s.slice(0, 10) } : { ok: false };
    }
    case "numeric": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
    }
    case "boolean":
      if (typeof value === "boolean") return { ok: true, value };
      if (value === "true" || value === "false") return { ok: true, value: value === "true" };
      return { ok: false };
    case "json":
      return { ok: true, value: clone(value) };
    default:
      return { ok: true, value: String(value) };
  }
}

/** Comparable form of a value for the column kind (null stays null). */
function comparable(spec: ColumnSpec, value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  switch (spec.kind) {
    case "timestamptz": {
      const ms = Date.parse(String(value));
      return Number.isNaN(ms) ? String(value) : ms;
    }
    case "numeric": {
      const n = Number(value);
      return Number.isNaN(n) ? String(value) : n;
    }
    case "boolean":
      return value === true || value === "true";
    case "json":
      return JSON.stringify(value);
    case "date":
      return String(value).slice(0, 10);
    default:
      return String(value);
  }
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

type Op = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "is" | "in";
type Filter =
  | { type: "cmp"; column: string; op: Op; value: unknown }
  | { type: "and" | "or"; items: Filter[] };

const OPS: readonly Op[] = ["eq", "neq", "gt", "gte", "lt", "lte", "is", "in"];

function matches(spec: TableSpec, row: GuestRow, filter: Filter): boolean {
  if (filter.type !== "cmp") {
    return filter.type === "and"
      ? filter.items.every((f) => matches(spec, row, f))
      : filter.items.some((f) => matches(spec, row, f));
  }
  const col = spec.columns[filter.column];
  const left = comparable(col, row[filter.column]);
  if (filter.op === "is") {
    if (filter.value === null) return left === null;
    return left === comparable({ kind: "boolean", notNull: false }, filter.value);
  }
  if (left === null) return false;
  if (filter.op === "in") {
    const values = filter.value as readonly unknown[];
    return values.some((v) => v !== null && comparable(col, v) === left);
  }
  if (filter.value === null || filter.value === undefined) return false;
  const right = comparable(col, filter.value);
  if (right === null) return false;
  switch (filter.op) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "lt":
      return left < right;
    default:
      return left <= right;
  }
}

/** Split on commas that are not inside parentheses or double quotes. */
function splitTopLevel(input: string): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (const ch of input) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (depth < 0) return null;
    if (!quoted && depth === 0 && ch === ",") {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (depth !== 0 || quoted) return null;
  parts.push(current);
  return parts;
}

function unquote(raw: string): string {
  const s = raw.trim();
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}

/** Parse a PostgREST logic expression list (body of `or=(...)`). Null = unsupported. */
function parseLogicList(expr: string, spec: TableSpec): Filter[] | null {
  const parts = splitTopLevel(expr);
  if (!parts || parts.length === 0) return null;
  const out: Filter[] = [];
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) return null;
    const group = /^(and|or)\(([\s\S]*)\)$/.exec(part);
    if (group) {
      const items = parseLogicList(group[2], spec);
      if (!items) return null;
      out.push({ type: group[1] as "and" | "or", items });
      continue;
    }
    const m = /^([a-z_][a-z0-9_]*)\.([a-z]+)\.([\s\S]*)$/.exec(part);
    if (!m) return null;
    const [, column, opName, rawValue] = m;
    if (!(column in spec.columns) || !(OPS as readonly string[]).includes(opName)) return null;
    const op = opName as Op;
    let value: unknown;
    if (op === "in") {
      const inner = /^\(([\s\S]*)\)$/.exec(rawValue.trim());
      if (!inner) return null;
      const items = splitTopLevel(inner[1]);
      if (!items) return null;
      value = items.map(unquote);
    } else if (op === "is") {
      const v = rawValue.trim();
      if (v === "null") value = null;
      else if (v === "true" || v === "false") value = v === "true";
      else return null;
    } else {
      value = unquote(rawValue);
    }
    out.push({ type: "cmp", column, op, value });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

type Action = "select" | "insert" | "update" | "delete" | "upsert";
type OrderSpec = { column: string; ascending: boolean; nullsFirst: boolean };

interface DbContext {
  store: Store;
  nextSeq: () => number;
  commit: (next: Store) => void;
  now: () => Date;
  uuid: () => string;
  timeZone: string;
}

class Builder {
  private action: Action = "select";
  private returning: string[] | null = null; // null = no select() on a mutation
  private selectAll = true;
  private countExact = false;
  private head = false;
  private payload: GuestRow[] = [];
  private patch: GuestRow = {};
  private upsertOpts: UpsertOptions = {};
  private filters: Filter[] = [];
  private orders: OrderSpec[] = [];
  private limitCount: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private cardinality: "many" | "single" | "maybe" = "many";
  private pending: FakeError | null = null;
  private result: Promise<FakeResult<unknown>> | null = null;

  constructor(
    private readonly ctx: DbContext,
    private readonly tableName: string,
  ) {
    if (!isTableName(tableName)) {
      this.pending = fakeError("GUEST_UNKNOWN_TABLE", `relation "public.${tableName}" does not exist`);
    }
  }

  private get spec(): TableSpec {
    return TABLE_SCHEMA[this.tableName as GuestTableName];
  }

  private fail(error: FakeError): this {
    if (!this.pending) this.pending = error;
    return this;
  }

  private setAction(action: Action): boolean {
    if (this.action !== "select" || this.returning !== null || this.filters.length > 0) {
      this.fail(fakeError("GUEST_UNSUPPORTED", `cannot call ${action}() after another statement method`));
      return false;
    }
    this.action = action;
    return true;
  }

  select(columns?: string, options?: SelectOptions): this {
    if (this.pending) return this;
    const raw = (columns ?? "*").trim();
    if (raw.includes("(") || raw.includes(")") || raw.includes(":")) {
      return this.fail(fakeError("GUEST_UNSUPPORTED_SELECT", `unsupported select syntax: ${raw}`));
    }
    const cols = raw.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
    if (cols.length === 0) return this.fail(fakeError("GUEST_UNSUPPORTED_SELECT", "empty select list"));
    if (cols.includes("*")) {
      this.selectAll = true;
      this.returning = [];
    } else {
      const unknown = isTableName(this.tableName) ? cols.find((c) => !(c in this.spec.columns)) : undefined;
      if (unknown) {
        return this.fail(fakeError("42703", `column ${this.tableName}.${unknown} does not exist`));
      }
      this.selectAll = false;
      this.returning = cols;
    }
    if (options?.count === "exact") this.countExact = true;
    if (options?.head) this.head = true;
    return this;
  }

  insert(rows: GuestRow | GuestRow[]): this {
    if (this.pending || !this.setAction("insert")) return this;
    this.payload = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ ...r }));
    return this;
  }

  upsert(rows: GuestRow | GuestRow[], options?: UpsertOptions): this {
    if (this.pending || !this.setAction("upsert")) return this;
    this.payload = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ ...r }));
    this.upsertOpts = { ...options };
    return this;
  }

  update(patch: GuestRow): this {
    if (this.pending || !this.setAction("update")) return this;
    this.patch = { ...patch };
    return this;
  }

  delete(): this {
    if (this.pending) return this;
    this.setAction("delete");
    return this;
  }

  private addCmp(column: string, op: Op, value: unknown): this {
    if (this.pending) return this;
    if (!(column in this.spec.columns)) {
      return this.fail(fakeError("42703", `column ${this.tableName}.${column} does not exist`));
    }
    this.filters.push({ type: "cmp", column, op, value });
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.addCmp(column, "eq", value);
  }
  neq(column: string, value: unknown): this {
    return this.addCmp(column, "neq", value);
  }
  gt(column: string, value: unknown): this {
    return this.addCmp(column, "gt", value);
  }
  gte(column: string, value: unknown): this {
    return this.addCmp(column, "gte", value);
  }
  lt(column: string, value: unknown): this {
    return this.addCmp(column, "lt", value);
  }
  lte(column: string, value: unknown): this {
    return this.addCmp(column, "lte", value);
  }
  is(column: string, value: null | boolean): this {
    return this.addCmp(column, "is", value);
  }
  in(column: string, values: readonly unknown[]): this {
    if (!Array.isArray(values)) {
      return this.fail(fakeError("GUEST_UNSUPPORTED_FILTER", "in() expects an array"));
    }
    return this.addCmp(column, "in", [...values]);
  }

  or(expression: string): this {
    if (this.pending) return this;
    const items = typeof expression === "string" ? parseLogicList(expression, this.spec) : null;
    if (!items) {
      return this.fail(fakeError("GUEST_UNSUPPORTED_FILTER", "unsupported or() expression", String(expression)));
    }
    this.filters.push({ type: "or", items });
    return this;
  }

  order(column: string, options?: OrderOptions): this {
    if (this.pending) return this;
    if (!(column in this.spec.columns)) {
      return this.fail(fakeError("42703", `column ${this.tableName}.${column} does not exist`));
    }
    const ascending = options?.ascending ?? true;
    this.orders.push({ column, ascending, nullsFirst: options?.nullsFirst ?? !ascending });
    return this;
  }

  limit(count: number): this {
    if (!Number.isInteger(count) || count < 0) {
      return this.fail(fakeError("GUEST_UNSUPPORTED", "limit() expects a non-negative integer"));
    }
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number): this {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from - 1) {
      return this.fail(fakeError("GUEST_UNSUPPORTED", "range() expects 0 <= from <= to + 1"));
    }
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  single(): this {
    this.cardinality = "single";
    return this;
  }

  maybeSingle(): this {
    this.cardinality = "maybe";
    return this;
  }

  then<R1 = FakeResult<unknown>, R2 = never>(
    onFulfilled?: ((value: FakeResult<unknown>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    if (!this.result) {
      let res: FakeResult<unknown>;
      try {
        res = this.execute();
      } catch (e) {
        res = { data: null, error: fakeError("GUEST_UNSUPPORTED", e instanceof Error ? e.message : String(e)), count: null };
      }
      this.result = Promise.resolve(res);
    }
    return this.result.then(onFulfilled, onRejected);
  }

  // ---- execution --------------------------------------------------------

  private errorResult(error: FakeError): FakeResult<unknown> {
    return { data: null, error, count: null };
  }

  private project(row: GuestRow): GuestRow {
    if (this.selectAll || !this.returning) return clone(row);
    const out: GuestRow = {};
    for (const c of this.returning) out[c] = clone(row[c] ?? null);
    return out;
  }

  private sortRows(rows: StoredRow[]): StoredRow[] {
    const spec = this.spec;
    return [...rows].sort((a, b) => {
      for (const o of this.orders) {
        const col = spec.columns[o.column];
        const x = comparable(col, a.row[o.column]);
        const y = comparable(col, b.row[o.column]);
        if (x === null && y === null) continue;
        if (x === null) return o.nullsFirst ? -1 : 1;
        if (y === null) return o.nullsFirst ? 1 : -1;
        if (x < y) return o.ascending ? -1 : 1;
        if (x > y) return o.ascending ? 1 : -1;
      }
      return a.seq - b.seq;
    });
  }

  private filtered(rows: StoredRow[]): StoredRow[] {
    return rows.filter((r) => this.filters.every((f) => matches(this.spec, r.row, f)));
  }

  /** Shape the final payload: projection, cardinality, count, head. */
  private shape(rows: GuestRow[], total: number | null): FakeResult<unknown> {
    const count = this.countExact ? total : null;
    if (this.head) return { data: null, error: null, count };
    if (this.cardinality !== "many") {
      if (rows.length === 1) return { data: this.project(rows[0]), error: null, count };
      if (rows.length === 0 && this.cardinality === "maybe") return { data: null, error: null, count };
      return this.errorResult(
        fakeError(
          "PGRST116",
          "JSON object requested, multiple (or no) rows returned",
          `The result contains ${rows.length} rows`,
        ),
      );
    }
    return { data: rows.map((r) => this.project(r)), error: null, count };
  }

  private execute(): FakeResult<unknown> {
    if (this.pending) return this.errorResult(this.pending);
    if (this.action === "select") return this.runSelect();
    return this.runMutation();
  }

  private runSelect(): FakeResult<unknown> {
    const table = this.ctx.store[this.tableName as GuestTableName];
    let rows = this.sortRows(this.filtered(table));
    const total = rows.length;
    if (this.rangeFrom !== null && this.rangeTo !== null) rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return this.shape(rows.map((r) => r.row), total);
  }

  private runMutation(): FakeResult<unknown> {
    const next: Store = {} as Store;
    for (const name of GUEST_TABLE_NAMES) next[name] = [...this.ctx.store[name]];
    const name = this.tableName as GuestTableName;
    let affected: GuestRow[];
    let error: FakeError | null;
    switch (this.action) {
      case "insert":
        ({ affected, error } = this.applyInsert(next, name, this.payload));
        break;
      case "upsert":
        ({ affected, error } = this.applyUpsert(next, name));
        break;
      case "update":
        ({ affected, error } = this.applyUpdate(next, name));
        break;
      default:
        ({ affected, error } = this.applyDelete(next, name));
        break;
    }
    if (error) return this.errorResult(error);
    const constraintError = checkConstraints(next);
    if (constraintError) return this.errorResult(constraintError);

    let out: FakeResult<unknown>;
    if (this.returning === null) {
      if (this.cardinality !== "many" && affected.length !== 1 && !(this.cardinality === "maybe" && affected.length === 0)) {
        // single()/maybeSingle() without select(): PostgREST still checks the row count.
        out = this.shape(affected, affected.length);
      } else {
        out = { data: null, error: null, count: this.countExact ? affected.length : null };
      }
    } else {
      out = this.shape(affected, affected.length);
    }
    if (out.error) return out; // atomic: nothing committed
    this.ctx.commit(next);
    return out;
  }

  /** Build a full row: validate payload columns, normalise, fill defaults. */
  private buildRow(input: GuestRow): { row?: GuestRow; error?: FakeError } {
    const spec = this.spec;
    for (const key of Object.keys(input)) {
      if (!(key in spec.columns)) {
        return { error: fakeError("PGRST204", `Could not find the '${key}' column of '${this.tableName}' in the schema cache`) };
      }
    }
    const row: GuestRow = {};
    for (const [col, colSpec] of Object.entries(spec.columns)) {
      if (col in input && input[col] !== undefined) {
        const n = normalize(colSpec, input[col]);
        if (!n.ok) return { error: fakeError("22P02", `invalid input value for column ${col}`) };
        row[col] = n.value;
      } else if (colSpec.default) {
        row[col] = this.defaultValue(colSpec);
      } else {
        row[col] = null;
      }
    }
    return { row };
  }

  private defaultValue(spec: ColumnSpec): unknown {
    const d = spec.default;
    if (!d) return null;
    if (d.kind === "uuid") return this.ctx.uuid();
    if (d.kind === "now") return this.ctx.now().toISOString();
    if (d.kind === "today") return dateInZone(this.ctx.now(), this.ctx.timeZone);
    return clone(d.value);
  }

  private applyInsert(next: Store, name: GuestTableName, payload: GuestRow[]): { affected: GuestRow[]; error: FakeError | null } {
    const affected: GuestRow[] = [];
    for (const input of payload) {
      const built = this.buildRow(input);
      if (built.error) return { affected: [], error: built.error };
      next[name].push({ seq: this.ctx.nextSeq(), row: built.row! });
      affected.push(built.row!);
    }
    return { affected, error: null };
  }

  private applyUpsert(next: Store, name: GuestTableName): { affected: GuestRow[]; error: FakeError | null } {
    const spec = this.spec;
    const conflict = (this.upsertOpts.onConflict ?? "id")
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    const known = conflict.length > 0 && conflict.every((c) => c in spec.columns);
    const isConstraint =
      known &&
      ((conflict.length === 1 && conflict[0] === "id") ||
        spec.unique.some((u) => u.length === conflict.length && u.every((c) => conflict.includes(c))));
    if (!isConstraint) {
      return {
        affected: [],
        error: fakeError("42P10", "there is no unique or exclusion constraint matching the ON CONFLICT specification"),
      };
    }
    const affected: GuestRow[] = [];
    for (const input of this.payload) {
      const built = this.buildRow(input);
      if (built.error) return { affected: [], error: built.error };
      const candidate = built.row!;
      const idx = next[name].findIndex((r) =>
        conflict.every((c) => {
          const a = comparable(spec.columns[c], r.row[c]);
          return a !== null && a === comparable(spec.columns[c], candidate[c]);
        }),
      );
      if (idx === -1) {
        next[name].push({ seq: this.ctx.nextSeq(), row: candidate });
        affected.push(candidate);
      } else if (!this.upsertOpts.ignoreDuplicates) {
        const merged: GuestRow = { ...next[name][idx].row };
        for (const key of Object.keys(input)) {
          if (input[key] !== undefined) merged[key] = candidate[key];
        }
        next[name][idx] = { seq: next[name][idx].seq, row: merged };
        affected.push(merged);
      }
    }
    return { affected, error: null };
  }

  private applyUpdate(next: Store, name: GuestTableName): { affected: GuestRow[]; error: FakeError | null } {
    const spec = this.spec;
    const patch: GuestRow = {};
    for (const [key, value] of Object.entries(this.patch)) {
      if (!(key in spec.columns)) {
        return { affected: [], error: fakeError("PGRST204", `Could not find the '${key}' column of '${name}' in the schema cache`) };
      }
      if (value === undefined) continue;
      const n = normalize(spec.columns[key], value);
      if (!n.ok) return { affected: [], error: fakeError("22P02", `invalid input value for column ${key}`) };
      patch[key] = n.value;
    }
    const affected: GuestRow[] = [];
    next[name] = next[name].map((r) => {
      if (!this.filters.every((f) => matches(spec, r.row, f))) return r;
      const row = { ...r.row, ...clone(patch) };
      affected.push(row);
      return { seq: r.seq, row };
    });
    return { affected, error: null };
  }

  private applyDelete(next: Store, name: GuestTableName): { affected: GuestRow[]; error: FakeError | null } {
    const spec = this.spec;
    const removed = next[name].filter((r) => this.filters.every((f) => matches(spec, r.row, f)));
    const removedSeqs = new Set(removed.map((r) => r.seq));
    next[name] = next[name].filter((r) => !removedSeqs.has(r.seq));
    const error = cascadeDelete(next, name, removed.map((r) => r.row));
    return { affected: removed.map((r) => r.row), error };
  }
}

/** Apply ON DELETE rules of every FK that references `table`. */
function cascadeDelete(next: Store, table: GuestTableName, removed: GuestRow[]): FakeError | null {
  if (removed.length === 0) return null;
  for (const child of GUEST_TABLE_NAMES) {
    for (const fk of TABLE_SCHEMA[child].foreignKeys) {
      if (fk.references.table !== table) continue;
      const hit = (row: GuestRow) =>
        removed.some((p) => fk.columns.every((c, i) => row[c] !== null && row[c] === p[fk.references.columns[i]]));
      const children = next[child].filter((r) => hit(r.row));
      if (children.length === 0) continue;
      if (fk.onDelete === "restrict") {
        return fakeError("23503", `update or delete on table "${table}" violates foreign key constraint on table "${child}"`);
      }
      next[child] = next[child].filter((r) => !hit(r.row));
      const err = cascadeDelete(next, child, children.map((r) => r.row));
      if (err) return err;
    }
  }
  return null;
}

/** Whole-store check: NOT NULL, CHECK, primary key + UNIQUE, foreign keys. */
function checkConstraints(next: Store): FakeError | null {
  for (const name of GUEST_TABLE_NAMES) {
    const spec = TABLE_SCHEMA[name];
    const rows = next[name];
    for (const { row } of rows) {
      for (const [col, colSpec] of Object.entries(spec.columns)) {
        const v = row[col];
        if (v === null || v === undefined) {
          if (colSpec.notNull) {
            return fakeError("23502", `null value in column "${col}" of relation "${name}" violates not-null constraint`);
          }
          continue;
        }
        if (colSpec.oneOf && !colSpec.oneOf.includes(v as string | number)) {
          return fakeError("23514", `new row for relation "${name}" violates check constraint on "${col}"`);
        }
        if (colSpec.range && (typeof v !== "number" || v < colSpec.range.min || v > colSpec.range.max)) {
          return fakeError("23514", `new row for relation "${name}" violates check constraint on "${col}"`);
        }
      }
    }
    for (const key of [["id"], ...spec.unique]) {
      const seen = new Set<string>();
      for (const { row } of rows) {
        const parts = key.map((c) => comparable(spec.columns[c], row[c]));
        if (parts.some((p) => p === null)) continue;
        const k = JSON.stringify(parts);
        if (seen.has(k)) {
          return fakeError("23505", `duplicate key value violates unique constraint "${name}_${key.join("_")}_key"`);
        }
        seen.add(k);
      }
    }
    for (const fk of spec.foreignKeys) {
      const parents = next[fk.references.table];
      for (const { row } of rows) {
        if (fk.columns.some((c) => row[c] === null || row[c] === undefined)) continue;
        const ok = parents.some((p) => fk.columns.every((c, i) => p.row[fk.references.columns[i]] === row[c]));
        if (!ok) {
          return fakeError("23503", `insert or update on table "${name}" violates foreign key constraint "${name}_${fk.columns.join("_")}_fkey"`);
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

function emptyStore(): Store {
  const s = {} as Store;
  for (const name of GUEST_TABLE_NAMES) s[name] = [];
  return s;
}

function toTables(store: Store): GuestTables {
  const out = {} as GuestTables;
  for (const name of GUEST_TABLE_NAMES) out[name] = store[name].map((r) => clone(r.row));
  return out;
}

export function createFakeDb(initialTables: GuestTables, options: CreateFakeDbOptions = {}): FakeDb {
  let seq = 0;
  const nextSeq = () => ++seq;
  const load = (tables: GuestTables): Store => {
    const s = emptyStore();
    for (const name of GUEST_TABLE_NAMES) {
      s[name] = (tables?.[name] ?? []).map((row) => ({ seq: nextSeq(), row: clone(row) }));
    }
    return s;
  };

  const ctx: DbContext = {
    store: load(initialTables),
    nextSeq,
    commit: (next) => {
      ctx.store = next;
      options.onChange?.(toTables(next));
    },
    now: options.now ?? (() => new Date()),
    uuid: options.uuid ?? defaultUuid,
    timeZone: options.timeZone ?? defaultTimeZone(),
  };

  return {
    from: (table: string) => new Builder(ctx, table) as unknown as FakeQueryBuilder,
    snapshot: () => toTables(ctx.store),
    replaceAll: (tables: GuestTables) => {
      ctx.store = load(tables);
    },
  };
}
