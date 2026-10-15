import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'src/lib/billing/**/*.test.ts',
      'src/app/billing/**/*.test.ts',
      'src/lib/fms/**/*.test.ts',
      'src/app/fms/**/*.test.ts',
    ],
    environment: 'node',
    globals: true,
  },
})
