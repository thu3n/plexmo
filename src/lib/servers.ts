import { randomUUID } from "node:crypto";
import { db } from "./db";

type DbServer = {
  id: string;
  name: string;
  baseUrl: string;
  token: string;
  createdAt: string;
  updatedAt: string;
  color?: string | null;
};

export type PublicServer = {
  id: string;
  name: string;
  baseUrl: string;
  createdAt: string;
  updatedAt: string;
  hasToken: boolean;
  maskedToken: string | null;
  color: string | null;
};

export type ServerInput = {
  name?: string;
  baseUrl: string;
  token: string;
  color?: string;
};

export type ServerUpdateInput = {
  name?: string;
  baseUrl?: string;
  token?: string;
  color?: string;
};

const sanitizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

const toPublicServer = (server: DbServer): PublicServer => ({
  id: server.id,
  name: server.name,
  baseUrl: server.baseUrl,
  createdAt: server.createdAt,
  updatedAt: server.updatedAt,
  hasToken: Boolean(server.token),
  maskedToken: server.token ? `${server.token.slice(0, 4)}…${server.token.slice(-2)}` : null,
  color: server.color || null,
});

const countServers = db.prepare<[], { count: number }>("SELECT COUNT(*) as count FROM servers");
const listStmt = db.prepare<[], DbServer>("SELECT * FROM servers ORDER BY datetime(createdAt) ASC");
const getByIdStmt = db.prepare<[string], DbServer | undefined>("SELECT * FROM servers WHERE id = ?");
const insertStmt = db.prepare<
  DbServer
>("INSERT INTO servers (id, name, baseUrl, token, createdAt, updatedAt, color) VALUES (@id, @name, @baseUrl, @token, @createdAt, @updatedAt, @color)");
const updateStmt = db.prepare<
  DbServer
>("UPDATE servers SET name=@name, baseUrl=@baseUrl, token=@token, updatedAt=@updatedAt, color=@color WHERE id=@id");
const deleteStmt = db.prepare<[string]>("DELETE FROM servers WHERE id = ?");

export const ensureDefaultServer = async () => {
  const { count } = countServers.get() ?? { count: 0 };
  if (count > 0) return null;

  const baseUrl = process.env.PLEX_BASE_URL;
  const token = process.env.PLEX_TOKEN;
  if (!baseUrl || !token) return null;

  const now = new Date().toISOString();
  const server: DbServer = {
    id: randomUUID(),
    name: "Standard Plex",
    baseUrl: sanitizeBaseUrl(baseUrl),
    token,
    createdAt: now,
    updatedAt: now,
  };

  insertStmt.run(server);
  return server;
};

export const listServers = async (): Promise<PublicServer[]> => {
  await ensureDefaultServer();
  const rows = listStmt.all();
  return rows.map(toPublicServer);
};

export const listInternalServers = async (): Promise<DbServer[]> => {
  await ensureDefaultServer();
  return listStmt.all();
};

export const getServerForDashboard = async (id?: string): Promise<DbServer | null> => {
  await ensureDefaultServer();

  if (id) {
    const server = getByIdStmt.get(id);
    if (server) return server;
  }

  const first = listStmt.get();
  return first ?? null;
};

export const createServer = async (input: ServerInput): Promise<PublicServer> => {
  const now = new Date().toISOString();
  const server: DbServer = {
    id: randomUUID(),
    name: input.name?.trim() || sanitizeBaseUrl(input.baseUrl).replace(/^https?:\/\//, ""),
    baseUrl: sanitizeBaseUrl(input.baseUrl),
    token: input.token,
    createdAt: now,
    updatedAt: now,
    color: input.color || null,
  };

  insertStmt.run(server);
  return toPublicServer(server);
};

export const updateServer = async (
  id: string,
  input: ServerUpdateInput,
): Promise<PublicServer> => {
  const existing = getByIdStmt.get(id);
  if (!existing) {
    throw new Error("Servern kunde inte hittas.");
  }

  const now = new Date().toISOString();
  const updated: DbServer = {
    id: existing.id,
    name: input.name !== undefined ? input.name.trim() : existing.name,
    baseUrl: input.baseUrl !== undefined ? sanitizeBaseUrl(input.baseUrl) : existing.baseUrl,
    token: input.token !== undefined ? input.token : existing.token,
    createdAt: existing.createdAt,
    updatedAt: now,
    color: input.color !== undefined ? input.color : existing.color,
  };

  updateStmt.run(updated);
  return toPublicServer(updated);
};

export const deleteServer = async (id: string) => {
  deleteStmt.run(id);
};
