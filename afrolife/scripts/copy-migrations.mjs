import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const sourceDirectory = resolve(projectRoot, 'migrations');
const outputDirectory = resolve(projectRoot, 'dist', 'migrations');

await mkdir(outputDirectory, { recursive: true });
const sourceFiles = (await readdir(sourceDirectory)).filter((name) => name.endsWith('.sql')).sort();
const sourceNames = new Set(sourceFiles);
for (const name of await readdir(outputDirectory)) {
  if (name.endsWith('.sql') && !sourceNames.has(name)) {
    await rm(join(outputDirectory, name), { force: true });
  }
}
for (const name of sourceFiles) {
  await copyFile(join(sourceDirectory, name), join(outputDirectory, name));
}
console.log(`Copied ${sourceFiles.length} SQL migrations to dist/migrations.`);
