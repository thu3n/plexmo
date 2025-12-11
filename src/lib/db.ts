import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const resolveDbPath = () => {
  // 1. Explicit override
  if (process.env.CONFIG_DIR) {
    const configDir = process.env.CONFIG_DIR;
    fs.mkdirSync(configDir, { recursive: true });
    return path.join(configDir, "plex-monitor.db");
  }

  // 2. Docker Volume Convention (/app/config)
  // If this directory exists (mounted via Docker volume), we use it automatically.
  const dockerConfigPath = path.join(process.cwd(), "config");
  if (process.env.NODE_ENV === "production" && fs.existsSync(dockerConfigPath)) {
    return path.join(dockerConfigPath, "plex-monitor.db");
  }

  // Also check absolute path /app/config just in case cwd varies
  if (fs.existsSync("/app/config")) {
    return path.join("/app/config", "plex-monitor.db");
  }

  // 3. Local Development Fallback
  const raw = process.env.DATABASE_URL || "file:./prisma/dev.db";
  const normalized = raw.startsWith("file:") ? raw.replace(/^file:/, "") : raw;
  const absolutePath = path.isAbsolute(normalized)
    ? normalized
    : path.join(process.cwd(), normalized);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  return absolutePath;
};

const dbPath = resolveDbPath();
// console.log(`[DB] Resolved Database Path: ${dbPath}`);

// Interface matching better-sqlite3 parts we use
interface DBInterface {
  pragma: (str: string) => void;
  exec: (str: string) => void;
  prepare: <T = any[], R = any>(sql: string) => StatementInterface<T, R>;
}

interface StatementInterface<T, R> {
  get: (...params: any[]) => R | undefined;
  all: (...params: any[]) => R[];
  run: (...params: any[]) => { changes: number; lastInsertRowid: number | bigint };
}

let dbInstance: any;

try {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      baseUrl TEXT NOT NULL,
      token TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      color TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_history (
      id TEXT PRIMARY KEY,
      serverId TEXT NOT NULL,
      user TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT,
      ratingKey TEXT NOT NULL,
      startTime INTEGER NOT NULL,
      stopTime INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      platform TEXT,
      device TEXT,
      ip TEXT
    );

    CREATE TABLE IF NOT EXISTS active_sessions (
      sessionId TEXT PRIMARY KEY,
      serverId TEXT NOT NULL,
      user TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT,
      ratingKey TEXT NOT NULL,
      startTime INTEGER NOT NULL,
      lastSeen INTEGER NOT NULL,
      state TEXT,
      platform TEXT,
      device TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT NOT NULL,
      username TEXT NOT NULL,
      email TEXT,
      thumb TEXT,
      serverId TEXT NOT NULL,
      importedAt TEXT NOT NULL,
      PRIMARY KEY (id, serverId)
    );


    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS allowed_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT,
      createdAt TEXT NOT NULL
    );
  `);


  // Checks for migration: add color column if missing
  try {
    db.prepare("ALTER TABLE servers ADD COLUMN color TEXT").run();
  } catch (e: any) {
    // Column likely already exists
  }
  dbInstance = db;
} catch (error) {
  console.error("CRITICAL: FAILED TO INITIALIZE DATABASE.");
  console.error(error);
  console.error("The application will start in recovery mode. Please check file permissions.");

  // Mock DB to prevent crash at startup (e.g. when servers.ts calls prepare())
  dbInstance = {
    pragma: () => { },
    exec: () => { },
    prepare: () => ({
      get: () => { throw new Error("Database not initialized (Check Permissions)"); },
      all: () => { throw new Error("Database not initialized (Check Permissions)"); },
      run: () => { throw new Error("Database not initialized (Check Permissions)"); },
    }),
  };
}

export const db = dbInstance as Database.Database;
