import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/lib/billing/**/*.test.ts', 'src/app/billing/**/*.test.ts'],
    environment: 'node',
  },
})
