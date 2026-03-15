/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-markdown$': '<rootDir>/src/__mocks__/react-markdown.tsx',
    '^remark-gfm$': '<rootDir>/src/__mocks__/remark-gfm.ts',
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/__tests__/**/*.test.tsx",
    "<rootDir>/tests/**/*.test.ts",
    "<rootDir>/tests/**/*.test.tsx",
  ],
  collectCoverageFrom: [
    // 核心覆蓋範圍：邏輯模組、工具函式、hooks、stores、API 純函式
    "src/lib/**/*.ts",
    "src/hooks/**/*.ts",
    "src/hooks/**/*.tsx",
    "src/stores/**/*.ts",
    "src/app/api/**/*.ts",
    "src/types/**/*.ts",
    // 排除
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
    // 排除需要完整 Supabase + AI 整合的 API 路由（應由整合測試覆蓋）
    "!src/app/api/admin/**",
    "!src/app/api/auth/**",
    "!src/app/api/canvas/**",
    "!src/app/api/conversations/**",
    "!src/app/api/copilot/**",
    "!src/app/api/knowledge/**", // Supabase + AI 整合路由（純函式已由個別測試覆蓋）
    "!src/app/api/chat/route.ts", // POST handler 需整合測試；純函式已由 route-utils.test.ts 覆蓋
    "!src/app/api/prompts/**",
    "!src/app/api/reports/**",
    "!src/app/api/rube/**",
    "!src/app/api/services/**",
    // 排除 Skills API route handlers（薄包裝層；核心邏輯由 lib/skills/api-handlers 測試覆蓋）
    "!src/app/api/skills/**",
    // 排除 Supabase 客戶端（框架設定，無邏輯）
    "!src/lib/supabase/**",
    // 排除型別定義檔（無可執行邏輯）
    "!src/types/**",
    // 排除 instrumentation（Next.js 框架 hook）
    "!src/instrumentation.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
}