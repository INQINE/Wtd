import { defineConfig } from 'vite';

export default defineConfig({
  // 상대 경로로 빌드해서 GitHub Pages 하위 경로에서도 동작하게 함
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // 파일 이름을 고정해서 웹 배포(아티팩트) 갱신을 단순하게
      output: { entryFileNames: 'assets/game.js', assetFileNames: 'assets/[name][extname]' },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
} as any);
