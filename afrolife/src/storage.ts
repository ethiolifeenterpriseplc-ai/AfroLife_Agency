import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(process.env.FILE_STORAGE_DIR ?? './data/private-files');

function filePath(key: string) {
  if (!/^[0-9a-f-]{36}$/i.test(key)) throw new Error('Invalid private file key');
  const p = resolve(root, key);
  if (!p.startsWith(root + '\\') && !p.startsWith(root + '/')) throw new Error('Invalid private file path');
  return p;
}

export async function putFile(key: string, content: Buffer) {
  const path = filePath(key);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, content, { flag: 'wx', mode: 0o600 });
}

export async function getFile(key: string) {
  return readFile(filePath(key));
}
