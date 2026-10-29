import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // 小さなフォントファイルを data: URL に埋め込まない。
    // CSP（font-src 'self'）で data: を禁止しているため、埋め込むと文字の一部が表示されなくなる
    assetsInlineLimit: 0,
  },
})
