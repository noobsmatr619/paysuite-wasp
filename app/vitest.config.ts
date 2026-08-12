import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

/**
 * Wasp validates the server env at import time, so anything importing from
 * `wasp/server` fails under a bare `vitest run`. Load .env.server the way
 * `wasp start` would, and fall back to placeholders so tests that only use
 * mocks still run without a database.
 */
function serverEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    for (const line of readFileSync(".env.server", "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env.server checked out — placeholders below cover mock-only tests.
  }
  return {
    // Wasp's schema accepts only 'development' | 'production'; vitest sets 'test'.
    NODE_ENV: "development",
    DATABASE_URL: env.DATABASE_URL || "postgresql://user:pass@localhost:5432/paysuite",
    ...env
  };
}

export default defineConfig({
  test: {
    environment: "node",
    env: serverEnv(),
    include: ["src/tests/**/*.test.ts"],
    exclude: [".wasp/**", "node_modules/**"],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
