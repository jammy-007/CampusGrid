import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function rmSafe(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

// 1. Remove Next.js persistent webpack cache
rmSafe(path.join(root, 'apps/web/.next/cache'));

// 2. Clean redundant Prisma engine caches, non-PostgreSQL WASM bundles, and node_modules sourcemaps
const pnpmDir = path.join(root, 'node_modules/.pnpm');

function stripMapsAndUnusedWasm(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      stripMapsAndUnusedWasm(fullPath);
    } else if (
      entry.name.endsWith('.js.map') ||
      entry.name.endsWith('.mjs.map') ||
      entry.name.endsWith('.cjs.map') ||
      entry.name.endsWith('.d.ts.map') ||
      /\.(cockroachdb|mysql|sqlite|sqlserver)\.(wasm|js|mjs)$/.test(entry.name)
    ) {
      rmSafe(fullPath);
    }
  }
}

if (fs.existsSync(pnpmDir)) {
  for (const entry of fs.readdirSync(pnpmDir)) {
    const pkgRoot = path.join(pnpmDir, entry, 'node_modules');

    if (entry.startsWith('@prisma+engines@')) {
      rmSafe(path.join(pkgRoot, '@prisma/engines/node_modules/.cache'));
    }

    if (entry.startsWith('prisma@')) {
      const prismaDir = path.join(pkgRoot, 'prisma');
      // Duplicate 20.2 MB binary (already present in @prisma/engines and .prisma/client)
      rmSafe(path.join(prismaDir, 'query_engine-windows.dll.node'));
    }
  }

  stripMapsAndUnusedWasm(pnpmDir);
}
