
import { db } from "./db";
import type { PlexUser } from "./plex";

export type DbUser = {
    id: string;
    username: string;
    email: string | null;
    thumb: string | null;
    serverId: string;
    importedAt: string;
};

const insertUserStmt = db.prepare<DbUser>(`
  INSERT INTO users (id, username, email, thumb, serverId, importedAt)
  VALUES (@id, @username, @email, @thumb, @serverId, @importedAt)
  ON CONFLICT(id, serverId) DO UPDATE SET
    username=excluded.username,
    email=excluded.email,
    thumb=excluded.thumb,
    importedAt=excluded.importedAt
`);

const listUsersStmt = db.prepare<[], DbUser>("SELECT * FROM users ORDER BY username ASC");

export const importUsers = (users: PlexUser[]) => {
    const now = new Date().toISOString();
    const transaction = db.transaction((usersToImport: PlexUser[]) => {
        for (const user of usersToImport) {
            insertUserStmt.run({
                id: user.id,
                username: user.username || user.title,
                email: user.email || null,
                thumb: user.thumb || null,
                serverId: user.serverName, // We are storing serverName as ID for now based on current PlexUser type, should theoretically be ID but name is what we have handy in the UI type. Ideally we'd map back to server ID.
                importedAt: now,
            });
        }
    });

    transaction(users);
};

export const listLocalUsers = (): DbUser[] => {
    return listUsersStmt.all();
};
