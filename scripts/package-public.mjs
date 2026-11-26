import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './public-files.mjs';
import { checkPublic } from './check-public.mjs';

// Small standard ZIP writer (stored entries). No external packaging dependency,
// absolute paths, source timestamps, Git metadata, or build artifacts.
const files = await checkPublic();
const chunks = [], directory = [];
let offset = 0;
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
for (const file of files) {
  const name = Buffer.from(`fr13nd-public/${file}`);
  const data = await readFile(join(root, file));
  const crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(33, 12); // 1980-01-01; no source machine timestamps
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  header.copy(central, 6, 4, 30);
  central.writeUInt32LE(offset, 42);
  chunks.push(header, name, data);
  directory.push(central, name);
  offset += header.length + name.length + data.length;
}
const central = Buffer.concat(directory);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(central.length, 12);
end.writeUInt32LE(offset, 16);
await mkdir(join(root, 'release'), { recursive: true });
await writeFile(join(root, 'release/fr13nd-public.zip'), Buffer.concat([...chunks, central, end]));
console.log('Created release/fr13nd-public.zip');
