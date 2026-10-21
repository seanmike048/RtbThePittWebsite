// Durable storage: one JSON file per collection, written atomically (temp file + rename), plus an append-only audit log.
// Single-process only. Firebase App Hosting / Cloud Run disks are per instance and not durable, so production needs the
// same interface backed by a managed database (see docs/the-pitt-ops-deployment.md). Uniqueness is enforced here, not in the UI.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const COLLECTIONS = ['runs', 'events', 'snapshots', 'refreshes', 'recommendations', 'previews', 'decisions', 'executions', 'meta'];

/** In-memory store; FileStore adds persistence. Tests use this class directly. */
export class MemoryStore {
  constructor() {
    this.data = Object.fromEntries(COLLECTIONS.map((c) => [c, {}]));
    this.auditEntries = [];
    this.queue = Promise.resolve();
  }

  /** Serialises every read-modify-write in this process. */
  tx(fn) {
    const run = this.queue.then(() => fn(this));
    this.queue = run.catch(() => {});
    return run;
  }

  get(c, id) {
    const v = this.data[c][id];
    return v === undefined ? null : structuredClone(v);
  }

  all(c, pred = () => true) {
    return Object.values(this.data[c]).map((v) => structuredClone(v)).filter(pred);
  }

  /** Insert only; a duplicate id throws so a caller can never overwrite by accident. */
  insert(c, id, value) {
    if (this.data[c][id] !== undefined) throw Object.assign(new Error('duplicate ' + c + ' ' + id), { code: 'duplicate' });
    this.data[c][id] = structuredClone(value);
    this.persist(c);
    return structuredClone(value);
  }

  update(c, id, fn) {
    const cur = this.data[c][id];
    if (cur === undefined) throw Object.assign(new Error('not found ' + c + ' ' + id), { code: 'not_found' });
    const next = fn(structuredClone(cur));
    this.data[c][id] = structuredClone(next);
    this.persist(c);
    return structuredClone(next);
  }

  persist() {}

  audit(entry) {
    const e = { at: new Date().toISOString(), ...entry };
    this.auditEntries.push(e);
    this.persistAudit(e);
  }

  persistAudit() {}

  auditLog() {
    return this.auditEntries.map((e) => structuredClone(e));
  }
}

export class FileStore extends MemoryStore {
  constructor(dir) {
    super();
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    for (const c of COLLECTIONS) {
      const p = join(dir, c + '.json');
      if (existsSync(p)) this.data[c] = JSON.parse(readFileSync(p, 'utf8'));
    }
    const a = join(dir, 'audit.jsonl');
    if (existsSync(a)) this.auditEntries = readFileSync(a, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }

  persist(c) {
    const p = join(this.dir, c + '.json');
    const tmp = p + '.' + process.pid + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.data[c]));
    renameSync(tmp, p);
  }

  persistAudit(e) {
    appendFileSync(join(this.dir, 'audit.jsonl'), JSON.stringify(e) + '\n');
  }
}
