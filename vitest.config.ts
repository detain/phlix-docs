import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue-jsx'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage',
      include: [
        'docs/.vitepress/**/*.ts',
        '!docs/.vitepress/dist/**'
      ],
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0
      }
    }
  }
})
