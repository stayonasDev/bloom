import { defineConfig } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": root,
      // lib/supabase.ts의 import "server-only"는 React 서버 밖(vitest)에서 throw하므로 빈 모듈로 대체
      "server-only": path.resolve(root, "tests/stubs/server-only.ts"),
    },
  },
});
