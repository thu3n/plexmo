import { db } from "./db";
import { type PlexSession, type PlexServerConfig } from "./plex";

export type HistoryEntry = {
  id: string;
  serverId: string;
  user: string;
  title: string;
  subtitle?: string;
  ratingKey: string;
  startTime: number;
  stopTime: number;
  duration: number;
  platform?: string;
  device?: string;
  ip?: string;
  serverName?: string;
};

const insertHistory = db.prepare(`
  INSERT INTO activity_history (
    id, serverId, user, title, subtitle, ratingKey, startTime, stopTime, duration, platform, device, ip
  ) VALUES (
    @id, @serverId, @user, @title, @subtitle, @ratingKey, @startTime, @stopTime, @duration, @platform, @device, @ip
  )
`);

const insertActive = db.prepare(`
  INSERT INTO active_sessions (
    sessionId, serverId, user, title, subtitle, ratingKey, startTime, lastSeen, state, platform, device
  ) VALUES (
    @sessionId, @serverId, @user, @title, @subtitle, @ratingKey, @startTime, @lastSeen, @state, @platform, @device
  )
`);

const updateActive = db.prepare(`
  UPDATE active_sessions SET lastSeen = @lastSeen, state = @state WHERE sessionId = @sessionId
`);

const deleteActive = db.prepare(`
  DELETE FROM active_sessions WHERE sessionId = @sessionId
`);

const getActiveSessions = db.prepare(`
  SELECT * FROM active_sessions WHERE serverId = @serverId
`);

type ActiveSessionRow = {
  sessionId: string;
  serverId: string;
  user: string;
  title: string;
  subtitle?: string;
  ratingKey: string;
  startTime: number;
  lastSeen: number;
  state: string;
  platform?: string;
  device?: string;
};

export const syncHistory = (server: PlexServerConfig, currentSessions: PlexSession[]) => {
  if (!server.id) return;

  const serverId = server.id;
  const now = Date.now();
  const storedSessions = getActiveSessions.all({ serverId }) as ActiveSessionRow[];

  // 1. Process current sessions: Insert new ones, update existing ones
  for (const session of currentSessions) {
    const existing = storedSessions.find((s) => s.sessionId === session.id);

    if (existing) {
      // Update heartbeat
      updateActive.run({
        lastSeen: now,
        state: session.state,
        sessionId: session.id,
      });
    } else {
      // New session started
      insertActive.run({
        sessionId: session.id,
        serverId,
        user: session.user,
        title: session.title,
        subtitle: session.subtitle,
        ratingKey: session.id, // Using session ID or ratingKey if available (PlexSession uses 'id' which might be ratingKey)
        startTime: now,
        lastSeen: now,
        state: session.state,
        platform: session.platform,
        device: session.device,
      });
    }
  }

  // 2. Process ended sessions: If in DB but not in current list (and older than threshold)
  // We accept a small grace period or just assume provided list is authoritative.
  // Since this is a poll, if it's missing now, it likely stopped recently.

  const currentIds = new Set(currentSessions.map((s) => s.id));

  for (const stored of storedSessions) {
    if (!currentIds.has(stored.sessionId)) {
      // Session has ended. Log it to history.
      // If the session hasn't been seen for a while (e.g. app was down), assume it ended at lastSeen.
      const timeSinceLastSeen = (now - stored.lastSeen) / 1000;
      const effectiveStopTime = timeSinceLastSeen > 60 ? stored.lastSeen : now;
      const durationSeconds = Math.round((effectiveStopTime - stored.startTime) / 1000);

      // Only log if it lasted more than a reasonable amount (e.g. 10s) to avoid noise?
      // For now log everything.

      insertHistory.run({
        id: crypto.randomUUID(),
        serverId,
        user: stored.user,
        title: stored.title,
        subtitle: stored.subtitle,
        ratingKey: stored.ratingKey,
        startTime: stored.startTime,
        stopTime: now,
        duration: durationSeconds,
        platform: stored.platform,
        device: stored.device,
        ip: null, // IP not currently extracted from session
      });

      // Remove from active
      deleteActive.run({ sessionId: stored.sessionId });
    }
  }
};

export const getHistory = (serverId?: string) => {
  const baseQuery = `
    SELECT h.*, s.name as serverName 
    FROM activity_history h
    LEFT JOIN servers s ON h.serverId = s.id
  `;

  const query = serverId
    ? db.prepare(`${baseQuery} WHERE h.serverId = ? ORDER BY stopTime DESC LIMIT 100`)
    : db.prepare(`${baseQuery} ORDER BY stopTime DESC LIMIT 100`);

  return query.all(serverId ? [serverId] : []);
};
