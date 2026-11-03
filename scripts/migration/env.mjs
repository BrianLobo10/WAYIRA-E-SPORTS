// Lee .env.migration (no versionado) sin dependencias externas.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadEnv(file = join(process.cwd(), '.env.migration')) {
  const env = { ...process.env };
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trimStart().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}
