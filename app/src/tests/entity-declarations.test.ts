import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Wasp only puts an operation's *declared* entities on `context.entities`.
 * Reading an undeclared one yields undefined, and the call fails at runtime
 * with "Cannot read properties of undefined" — or, worse, silently skips a
 * guard.
 *
 * That is exactly how the permission checks came to be inert: assertPermission
 * reads entities.RoleUser, and 22 operations never declared it. Nothing caught
 * it until the endpoint was exercised against a running server.
 *
 * This walks every operation in main.wasp, finds its implementation, and
 * asserts each `entities.X` it touches — directly, or through a helper it
 * passes `context.entities` to — is declared.
 */
const wasp = readFileSync("main.wasp", "utf8");

type Op = { name: string; fn: string; module: string; declared: Set<string> };

function operations(): Op[] {
  const out: Op[] = [];
  for (const m of wasp.matchAll(/(?:action|query|api)\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const [, name, body] = m;
    const fn = /import\s*\{\s*(\w+)\s*\}\s*from\s*"@src\/([^"]+)"/.exec(body);
    if (!fn) continue;
    const ents = /entities:\s*\[([^\]]*)\]/.exec(body);
    out.push({
      name,
      fn: fn[1],
      module: fn[2],
      declared: new Set(
        ents ? ents[1].split(",").map((e) => e.trim()).filter(Boolean) : []
      )
    });
  }
  return out;
}

function sourceOf(module: string): string | null {
  for (const ext of [".ts", ".tsx"]) {
    const path = `src/${module}${ext}`;
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  return null;
}

/** Body of one exported function, stopping at the next top-level export. */
function bodyOf(source: string, fn: string): string | null {
  const start = new RegExp(
    `export\\s+(?:const\\s+${fn}\\b|async\\s+function\\s+${fn}\\b|function\\s+${fn}\\b)`
  ).exec(source);
  if (!start) return null;
  const rest = source.slice(start.index + start[0].length);
  const next = /\nexport\s+(?:const|async\s+function|function)\s/.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** Entities the function reads off `entities.` / `context.entities.`. */
function entitiesUsed(body: string): Set<string> {
  return new Set([...body.matchAll(/entities\.(\w+)/g)].map((m) => m[1]));
}

/** Helpers this function hands `context.entities` to, so their reads count too. */
function helpersGivenEntities(body: string): string[] {
  return [...body.matchAll(/\b(\w+)\(\s*context\.entities/g)].map((m) => m[1]);
}

/** Where a name is imported from, resolved relative to the importing module. */
function importedFrom(source: string, name: string, module: string): string | null {
  const re = new RegExp(
    `import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*"([^"]+)"`
  );
  const m = re.exec(source);
  if (!m) return null;
  const spec = m[1];
  if (!spec.startsWith(".")) return null;
  const dir = module.split("/").slice(0, -1);
  for (const part of spec.split("/")) {
    if (part === ".") continue;
    else if (part === "..") dir.pop();
    else dir.push(part);
  }
  return dir.join("/");
}

/**
 * Entities a helper reads, following one level of relative import. Without
 * this the check is decorative: assertPermission lives in shared/planLimits,
 * so its read of entities.RoleUser is invisible from the calling module.
 */
function helperEntities(source: string, module: string, helper: string): Set<string> {
  const local = bodyOf(source, helper);
  if (local) return entitiesUsed(local);
  const target = importedFrom(source, helper, module);
  if (!target) return new Set();
  const helperSource = sourceOf(target);
  if (!helperSource) return new Set();
  const body = bodyOf(helperSource, helper);
  if (!body) return new Set();
  const used = entitiesUsed(body);
  // assertPermission delegates to userHasPermission in the same module.
  for (const nested of [...body.matchAll(/\b(\w+)\(\s*entities\b/g)].map((m) => m[1])) {
    const nestedBody = bodyOf(helperSource, nested);
    if (nestedBody) for (const e of entitiesUsed(nestedBody)) used.add(e);
  }
  return used;
}

describe("operations declare the entities they use", () => {
  const ops = operations();

  it("finds the operations in main.wasp", () => {
    expect(ops.length).toBeGreaterThan(50);
  });

  for (const op of ops) {
    it(`${op.name} declares what it touches`, () => {
      const source = sourceOf(op.module);
      if (!source) return;
      const body = bodyOf(source, op.fn);
      if (!body) return;

      const used = entitiesUsed(body);
      // Fold in entities read by helpers handed context.entities.
      for (const helper of helpersGivenEntities(body)) {
        for (const e of helperEntities(source, op.module, helper)) used.add(e);
      }

      const missing = [...used].filter((e) => !op.declared.has(e)).sort();
      expect(
        missing,
        `${op.name} reads entities.${missing.join(", entities.")} but does not declare ${missing.join(", ")}`
      ).toEqual([]);
    });
  }
});
