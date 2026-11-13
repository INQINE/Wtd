import { defineConfig } from 'vite';

export default defineConfig({
  // 상대 경로로 빌드해서 GitHub Pages 하위 경로에서도 동작하게 함
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
} as any);
