import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Writes dist/sw.js after the build. It lists every built file so the
// service worker can store them all for offline use. The version is a hash
// of the file contents, so each new build makes the phone pick up an update.
function serviceWorker(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'meal-planner-service-worker',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(relative(outDir, full).split('\\').join('/'));
        }
      };
      walk(outDir);
      const precache = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map')).sort();
      const hash = createHash('sha256');
      for (const f of precache) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(resolve(config.root, 'sw/sw.js'), 'utf8');
      const source = template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache.map((f) => './' + f), null, 2));
      writeFileSync(join(outDir, 'sw.js'), source);
      console.log(`service worker: version ${version}, ${precache.length} files`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  build: { sourcemap: false },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
} as never);
