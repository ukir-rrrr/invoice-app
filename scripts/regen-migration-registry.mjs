import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'lib/db/migrations');
const sql = fs.readFileSync(path.join(root, '001_init.sql'), 'utf8');
const hash = fs.readFileSync(path.join(root, '001_init.sql.sha256'), 'utf8').trim();
const escaped = sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
const out = `export const MIGRATION_001_NAME = '001_init';
export const MIGRATION_001_VERSION = 1;
export const MIGRATION_001_CHECKSUM = '${hash}';
export const MIGRATION_001_SQL = \`${escaped}\`;
`;
fs.writeFileSync(path.join(root, 'registry.ts'), out);
