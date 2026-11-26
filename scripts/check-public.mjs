import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicFiles, root } from './public-files.mjs';

export async function checkPublic() {
  const files = await publicFiles();
  const errors = [];
  const forbidden = /(?:^|\/)(?:\.env(?:\..*)?|.*-data\.json|.*\.bak\.json|.*-export-.*\.json|.*\.(?:pem|key|pfx|log)|\.git|node_modules|target|build|conversations|exports|void)(?:\/|$)/i;
  const checks = [
    ['personal Windows path', /[A-Z]:[\\/]+Users[\\/]+[^\s"'<>]+/i],
    ['personal Unix path', /\/(?:Users|home)\/[a-zA-Z0-9_.-]+\//],
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['provider credential', /(?:sk-ant-[\w-]{20,}|sk-[a-zA-Z0-9_-]{32,}|gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|AKIA[A-Z0-9]{16})/],
    ['personal email', /[a-zA-Z0-9._%+-]+@(?:gmail|hotmail|outlook|yahoo|icloud)\.[a-zA-Z]{2,}/i],
  ];
  for (const name of files) {
    if (forbidden.test(name)) errors.push(`${name}: private/runtime filename`);
    if (/\.(?:png|ico|icns)$/.test(name)) continue;
    const content = await readFile(join(root, name), 'utf8');
    for (const [label, pattern] of checks) if (pattern.test(content)) errors.push(`${name}: ${label}`);
  }
  const config = JSON.parse(await readFile(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  if (config.identifier !== 'app.fr13nd.portfolio') errors.push('Public application storage identifier changed.');
  const rust = await readFile(join(root, 'src-tauri/src/lib.rs'), 'utf8');
  const loader = rust.slice(rust.indexOf('fn data_file_path'), rust.indexOf('#[tauri::command]', rust.indexOf('fn data_file_path')));
  if (/current_dir|canonicalize|\.parent\(|unwrap_or_default/.test(loader)) errors.push('Data loader may discover files outside public app storage.');
  if (/desktop\.join\("fr13nd"\)/.test(rust)) errors.push('Desktop archive overlaps another edition.');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Public-file checks passed: ${files.length} files; no detected credential or personal-path patterns.`);
  return files;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkPublic();
}
