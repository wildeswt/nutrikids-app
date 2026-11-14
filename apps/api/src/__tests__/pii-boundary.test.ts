import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '..');

function getFilesRecursively(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Límite arquitectónico de PII (Regla de descifrado)', () => {
  it('las rutas y middlewares NUNCA importan pii-crypto ni llaman a decryptPii', () => {
    const routesDir = path.join(srcDir, 'routes');
    const middlewaresDir = path.join(srcDir, 'middlewares');

    const targetFiles = [...getFilesRecursively(routesDir), ...getFilesRecursively(middlewaresDir)];

    expect(targetFiles.length).toBeGreaterThan(0);

    for (const filePath of targetFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const relPath = path.relative(srcDir, filePath);

      expect(
        content.includes('pii-crypto'),
        `El archivo ${relPath} no debe importar directamente pii-crypto`,
      ).toBe(false);

      expect(
        content.includes('decryptPii'),
        `El archivo ${relPath} no debe invocar decryptPii`,
      ).toBe(false);
    }
  });

  it('únicamente la capa de servicios y utilidades autorizadas acceden a pii.service o pii-crypto', () => {
    const allFiles = getFilesRecursively(srcDir);

    for (const filePath of allFiles) {
      const relPath = path.relative(srcDir, filePath);

      // Excluir tests, servicios, lib de pii y seed
      if (
        relPath.startsWith('__tests__') ||
        relPath.startsWith('services') ||
        relPath === 'lib/pii-crypto.ts' ||
        relPath === 'lib/seedDev.ts'
      ) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      expect(
        content.includes('decryptUserNames') || content.includes('decryptChildNames'),
        `El archivo ${relPath} no está autorizado para descifrar PII`,
      ).toBe(false);
    }
  });
});
