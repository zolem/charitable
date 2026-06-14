import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Each test file gets its own worker → fresh module registry → fresh in-memory DB
    pool: 'forks',
    env: {
      DATABASE_PATH: ':memory:',
    },
  },
})
