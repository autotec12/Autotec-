import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

function createBuildVersion(): { version: string; builtAt: string } {
  const builtAt = new Date().toISOString();
  const shortSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const stamp = builtAt.replace(/[-:T.Z]/g, '').slice(0, 14);
  const version = shortSha ? `${stamp}-${shortSha}` : `v${stamp}`;
  return { version, builtAt };
}

function autotecVersionPlugin(buildMeta: { version: string; builtAt: string }): Plugin {
  const payload = JSON.stringify(
    {
      version: buildMeta.version,
      builtAt: buildMeta.builtAt,
    },
    null,
    2
  );

  let resolvedOutDir = 'dist';

  return {
    name: 'autotec-version-plugin',
    configResolved(config) {
      resolvedOutDir = config.build.outDir || 'dist';
    },
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.end(payload);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: payload,
      });
    },
    writeBundle() {
      const distSwPath = path.resolve(import.meta.dirname, resolvedOutDir, 'sw.js');
      if (fs.existsSync(distSwPath)) {
        const swContent = fs.readFileSync(distSwPath, 'utf-8');
        const stamped = swContent.replace(
          /__AUTOTEC_CACHE_VERSION__|autotec-finance-v2/g,
          `autotec-finance-${buildMeta.version}`
        );
        fs.writeFileSync(distSwPath, stamped, 'utf-8');
      }
    },
  };
}

export default defineConfig(() => {
  const buildMeta = createBuildVersion();

  return {
    plugins: [react(), tailwindcss(), autotecVersionPlugin(buildMeta)],
    define: {
      __APP_BUILD_VERSION__: JSON.stringify(buildMeta.version),
      __APP_BUILD_TIME__: JSON.stringify(buildMeta.builtAt),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
