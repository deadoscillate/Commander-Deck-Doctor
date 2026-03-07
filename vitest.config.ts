import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "app/api/analyze/route.ts",
        "app/api/import-url/route.ts",
        "app/api/share-report/route.ts",
        "app/api/simulate/route.ts",
        "lib/api/http.ts",
        "lib/api/rateLimit.ts"
      ],
      thresholds: {
        statements: 40,
        branches: 35,
        functions: 40,
        lines: 40
      }
    }
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react"
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  }
});
