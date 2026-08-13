import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Authentication fixtures deliberately exercise production-strength
    // scrypt. Running every integration file concurrently can starve the
    // worker pool and produce machine-dependent hook/test timeouts.
    fileParallelism: false,
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
  },
});
