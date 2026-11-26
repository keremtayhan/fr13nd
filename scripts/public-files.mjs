import { readdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
const roots = ['src', 'static', 'scripts', 'src-tauri/src', 'src-tauri/icons', 'src-tauri/capabilities', '.github/workflows'];
const files = ['README.md', 'LICENSE', '.gitignore', 'package.json', 'package-lock.json', 'svelte.config.js', 'tsconfig.json', 'vite.config.js', 'vitest.config.ts', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/build.rs', 'src-tauri/tauri.conf.json'];

export async function publicFiles() {
  const out = [...files];
  async function walk(relative) {
    for (const entry of await readdir(resolve(root, relative), { withFileTypes: true })) {
      const name = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are not publishable: ${name}`);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) out.push(name);
    }
  }
  for (const dir of roots) await walk(dir);
  for (const name of out) {
    if (!(await lstat(join(root, name))).isFile()) throw new Error(`Not a regular file: ${name}`);
  }
  return out.sort();
}
