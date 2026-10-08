import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';
import { execFile, execSync } from 'child_process';
import fs from 'fs';

// Get version from environment, git tag, or package.json
function getVersion(): string {
  // 1. Environment variable (set by GitHub Actions)
  if (process.env.VERSION) {
    return process.env.VERSION;
  }

  // 2. Try git tag
  try {
    const gitTag = execSync('git describe --tags --exact-match 2>/dev/null || git describe --tags 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
    if (gitTag) {
      return gitTag;
    }
  } catch {
    // Git not available or no tags
  }

  // 3. Fall back to package.json version
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
    if (pkg.version && pkg.version !== '0.0.0') {
      return pkg.version;
    }
  } catch {
    // package.json not readable
  }

  return 'dev';
}

// Aggregate-only local ledger boundary. Credentials and raw runtime rows never leave Usage.
function ledgerHistoryBridge() {
  const attach = (server: {
    middlewares: {
      use: (
        handler: (
          req: import('http').IncomingMessage,
          res: import('http').ServerResponse,
          next: () => void
        ) => void
      ) => void;
    };
  }) => {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== '/ledger-history') return next();
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end('{"error":"GET required"}');
        return;
      }
      execFile(
        '/home/david/projects/usage/.venv/bin/python',
        ['/home/david/projects/usage/scripts/cpamc_history.py'],
        { timeout: 8000, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout) => {
          res.statusCode = error ? 503 : 200;
          res.end(error ? '{"error":"Ledger history unavailable"}' : stdout);
        }
      );
    });
  };
  return { name: 'local-ledger-history', configureServer: attach, configurePreviewServer: attach };
}

function isTrustedHost(host: string | undefined): boolean {
  const name = (host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return name === 'localhost' || name === '::1' || /^\d{1,3}(\.\d{1,3}){3}$/.test(name);
}

// Keep the original Mix page and its polling on CPAMC's reachable port.
// Only this page may be framed by CPAMC on the same hostname (dev or bundled).
const frameableUsagePage: NonNullable<ProxyOptions['configure']> = (proxy) => {
  proxy.on('proxyRes', (response, request) => {
    const host = request.headers.host;
    if (!isTrustedHost(host)) return;
    const hostname = new URL(`http://${host}`).hostname;
    delete response.headers['x-frame-options'];
    response.headers['content-security-policy'] =
      `frame-ancestors 'self' http://${hostname}:5173 http://${hostname}:8317`;
  });
};

const usageMixProxy: Record<string, ProxyOptions> = {
  '/mix.html': {
    target: 'http://127.0.0.1:47193',
    changeOrigin: true,
    configure: frameableUsagePage,
  },
  '/mix-seed.js': { target: 'http://127.0.0.1:47193', changeOrigin: true },
  '/live.json': { target: 'http://127.0.0.1:47193', changeOrigin: true },
  '/mix-hours': { target: 'http://127.0.0.1:47193', changeOrigin: true },
  '^/token-history.*\\.html$': {
    target: 'http://127.0.0.1:47193',
    changeOrigin: true,
    configure: frameableUsagePage,
  },
  '/token-history.json': { target: 'http://127.0.0.1:47193', changeOrigin: true },
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    ledgerHistoryBridge(),
    react(),
    viteSingleFile({
      removeViteModuleLoader: true
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Same-origin path for the Usage server's quota-windows page so the
    // embedded frame never depends on a second host name or port.
    proxy: {
      ...usageMixProxy,
      '/quota-windows': { target: 'http://127.0.0.1:47193', changeOrigin: true }
    }
  },
  preview: {
    proxy: usageMixProxy,
  },
  define: {
    __APP_VERSION__: JSON.stringify(getVersion())
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: '[name]__[local]___[hash:base64:5]'
    },
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/styles/variables.scss" as *;`
      }
    }
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rolldownOptions: {
      output: {
        codeSplitting: false
      }
    }
  }
});
