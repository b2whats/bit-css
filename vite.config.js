import { splitVendorChunkPlugin } from 'vite'


export default {
  root: './src',
  plugins: [splitVendorChunkPlugin()],
  publicDir: '../public',
  build: {
    outDir: '../build',
    emptyOutDir: true,
    sourcemap: 'hidden',
  },
  server: {
    port: 3000,
    host: true,
    strictPort: true
  }
}