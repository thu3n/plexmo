import { randomUUID } from "node:crypto";
import { db } from "./db";

export type AllowedUser = {
    id: string;
    email: string;
    username: string | null;
    createdAt: string;
};

const listStmt = db.prepare<[], AllowedUser>("SELECT * FROM allowed_users ORDER BY datetime(createdAt) DESC");
const insertStmt = db.prepare<
    { id: string; email: string; username: string | null; createdAt: string }
>("INSERT INTO allowed_users (id, email, username, createdAt) VALUES (@id, @email, @username, @createdAt)");
const deleteStmt = db.prepare<[string]>("DELETE FROM allowed_users WHERE id = ?");

export const listAllowedUsers = async (): Promise<AllowedUser[]> => {
    return listStmt.all();
};

export const addAllowedUser = async (email: string, username?: string): Promise<AllowedUser> => {
    const now = new Date().toISOString();
    const newUser = {
        id: randomUUID(),
        email: email.toLowerCase().trim(),
        username: username || null,
        createdAt: now,
    };

    insertStmt.run(newUser);
    return newUser;
};

export const removeAllowedUser = async (id: string): Promise<void> => {
    deleteStmt.run(id);
};
