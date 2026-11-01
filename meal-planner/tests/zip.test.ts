// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, createZip } from '../src/zip';

describe('zip writer', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('makes a file that Python zipfile reads back exactly', async () => {
    const photo = new Uint8Array(5000).map((_, i) => (i * 7) % 256);
    const blob = createZip([
      { name: 'meal-log.md', data: new TextEncoder().encode('# Meal log — ünïcode ✓\n') },
      { name: 'photos/2026-11-01_lunch-1_eaten_1.jpg', data: photo },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const file = join(dir, 'x.zip');
    writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
    const out = execFileSync('python3', [
      '-c',
      'import zipfile,sys,hashlib;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;' +
        'print(z.read("meal-log.md").decode());print(hashlib.md5(z.read(z.namelist()[1])).hexdigest())',
      file,
    ]).toString();
    expect(out).toContain('# Meal log — ünïcode ✓');
    const { createHash } = await import('node:crypto');
    expect(out).toContain(createHash('md5').update(photo).digest('hex'));
  });
});
