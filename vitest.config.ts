import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  define: { __MOCK__: true },
  test: {
    environment: 'jsdom',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/components/**/*.test.ts',
      'tests/contract/**/*.test.ts',
    ],
    restoreMocks: true,
    setupFiles: ['tests/setup.ts'],
  },
});
