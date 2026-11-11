// @ts-nocheck
// node:sqlite stand-in backed by sql.js, so the real store runs inside a page.
import initSqlJs from 'sql.js/dist/sql-asm.js';

const KEY = 'sw-inpage-db-v4';
let SQL: any;
export async function ready() {
  SQL = await initSqlJs();
}
const norm = (args: unknown[]) =>
  args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? (a ? 1 : 0) : a));

function load(): Uint8Array | undefined {
  try {
    const saved = localStorage.getItem(KEY);
    if (!saved) return undefined;
    return Uint8Array.from(atob(saved), (c) => c.charCodeAt(0));
  } catch {
    return undefined;
  }
}

export class DatabaseSync {
  db: any;
  timer: ReturnType<typeof setTimeout> | null = null;
  constructor() {
    try {
      this.db = new SQL.Database(load());
    } catch {
      this.db = new SQL.Database();
    }
  }
  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        const bytes: Uint8Array = this.db.export();
        let text = '';
        for (let i = 0; i < bytes.length; i += 0x8000)
          text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        localStorage.setItem(KEY, btoa(text));
      } catch {
        // Storage can be unavailable; the page still works until it is reloaded.
      }
    }, 600);
  }
  exec(sql: string) {
    this.db.exec(sql);
  }
  prepare(sql: string) {
    const db = this.db;
    const self = this;
    const rows = (args: unknown[], one: boolean) => {
      const st = db.prepare(sql);
      try {
        st.bind(norm(args));
        const out = [];
        while (st.step()) {
          out.push(st.getAsObject());
          if (one) break;
        }
        return out;
      } finally {
        st.free();
      }
    };
    return {
      get: (...args: unknown[]) => rows(args, true)[0],
      all: (...args: unknown[]) => rows(args, false),
      run: (...args: unknown[]) => {
        db.run(sql, norm(args));
        self.save();
        return { changes: db.getRowsModified() };
      },
    };
  }
  close() {}
}
