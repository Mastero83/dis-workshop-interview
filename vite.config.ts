import { defineConfig } from 'vite'

// Projectsite op GitHub Pages: https://mastero83.github.io/dis-workshop-interview/
export default defineConfig({
  base: '/dis-workshop-interview/',
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
})
