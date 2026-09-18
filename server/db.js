// Minimal, dependency-free JSON collection store.
// Each collection is persisted to its own file under data/ and kept in memory.
// Good enough for a single-instance app; swap for a real DB to scale out.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function fileFor(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

async function readCollection(name) {
  try {
    const raw = await fs.readFile(fileFor(name), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeCollection(name, rows) {
  await ensureDir();
  const tmp = `${fileFor(name)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), 'utf8');
  await fs.rename(tmp, fileFor(name)); // atomic replace
}

/**
 * A tiny collection API: list / get / insert / update / remove.
 * Records get an id, createdAt and updatedAt automatically.
 */
export function collection(name) {
  return {
    async list() {
      const rows = await readCollection(name);
      return rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    },
    async get(id) {
      const rows = await readCollection(name);
      return rows.find((r) => r.id === id) || null;
    },
    async insert(data) {
      const rows = await readCollection(name);
      const now = new Date().toISOString();
      const row = { id: randomUUID(), ...data, createdAt: now, updatedAt: now };
      rows.push(row);
      await writeCollection(name, rows);
      return row;
    },
    async update(id, patch) {
      const rows = await readCollection(name);
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      rows[idx] = { ...rows[idx], ...patch, id, updatedAt: new Date().toISOString() };
      await writeCollection(name, rows);
      return rows[idx];
    },
    async remove(id) {
      const rows = await readCollection(name);
      const next = rows.filter((r) => r.id !== id);
      if (next.length === rows.length) return false;
      await writeCollection(name, next);
      return true;
    },
  };
}

export const contacts = collection('contacts');
export const templates = collection('templates');
export const emails = collection('emails');
