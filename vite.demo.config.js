// デモモード（架空データで画面を確認する）。実行: npm run demo
// Supabase・暗号化・パスキーを demo/ フォルダの代わりの部品に差し替える。本番のビルドには含まれない
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const swap = {
  '/src/supabase.js': './demo/supabase.js',
  '/src/crypto.js': './demo/crypto.js',
  '/src/passkey.js': './demo/passkey.js',
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'demo-swap',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        if (importer?.includes('/demo/')) return null // 差し替え先どうしの読み込みはそのまま
        const r = await this.resolve(source, importer, { ...options, skipSelf: true })
        if (!r) return null
        for (const [from, to] of Object.entries(swap)) {
          if (r.id.endsWith(from)) return fileURLToPath(new URL(to, import.meta.url))
        }
        return null
      },
    },
  ],
})
