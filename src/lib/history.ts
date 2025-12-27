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
  meta_json?: string;
  pausedCounter: number;
  thumb?: string;
  parentThumb?: string;
};

const insertHistory = db.prepare(`
  INSERT INTO activity_history (
    id, serverId, user, title, subtitle, ratingKey, startTime, stopTime, duration, platform, device, ip, meta_json, pausedCounter
  ) VALUES (
    @id, @serverId, @user, @title, @subtitle, @ratingKey, @startTime, @stopTime, @duration, @platform, @device, @ip, @meta_json, @pausedCounter
  )
` as any);

const insertActive = db.prepare(`
  INSERT OR REPLACE INTO active_sessions (
    sessionId, serverId, user, title, subtitle, ratingKey, startTime, lastSeen, state, platform, device, meta_json, pausedCounter, pausedSince
  ) VALUES (
    @sessionId, @serverId, @user, @title, @subtitle, @ratingKey, @startTime, @lastSeen, @state, @platform, @device, @meta_json, @pausedCounter, @pausedSince
  )
` as any);

const updateActive = db.prepare(`
  UPDATE active_sessions 
  SET lastSeen = @lastSeen, state = @state, meta_json = @meta_json, pausedCounter = @pausedCounter, pausedSince = @pausedSince 
  WHERE sessionId = @sessionId
` as any);

const deleteActive = db.prepare(`
  DELETE FROM active_sessions WHERE sessionId = @sessionId
`);

const deleteHistoryById = db.prepare(`
  DELETE FROM activity_history WHERE id = @id
`);

const getActiveSessions = db.prepare(`
  SELECT a.*, s.name as serverName
  FROM active_sessions a
  LEFT JOIN servers s ON a.serverId = s.id
  WHERE a.serverId = @serverId
`);

const getAllActiveSessions = db.prepare(`
  SELECT a.*, s.name as serverName
  FROM active_sessions a
  LEFT JOIN servers s ON a.serverId = s.id
`);

type ActiveSessionRow = {
  sessionId: string;
  serverId: string;
  serverName: string | null;
  user: string;
  title: string;
  subtitle?: string;
  ratingKey: string;
  startTime: number;
  lastSeen: number;
  state: string;
  platform?: string;
  device?: string;
  meta_json?: string;
  pausedCounter: number;
  pausedSince: number | null;
};

export const syncHistory = (server: PlexServerConfig, currentSessions: PlexSession[]) => {
  if (!server.id) return { newSessions: [], endedSessions: [] };

  const serverId = server.id;
  const now = Date.now();
  const storedSessions = getActiveSessions.all({ serverId }) as ActiveSessionRow[];

  const newSessions: PlexSession[] = [];
  const endedSessions: HistoryEntry[] = [];

  // 1. Process current sessions: Insert new ones, update existing ones
  for (const session of currentSessions) {
    const existing = storedSessions.find((s) => s.sessionId === session.id);
    const isPaused = session.state === 'paused';

    if (existing) {
      // Update heartbeat
      // Calculate pause duration
      let pausedCounter = existing.pausedCounter;
      let pausedSince = existing.pausedSince;

      if (isPaused) {
        // If it was already paused, keep pausedSince. If newly paused, set it.
        if (!pausedSince) pausedSince = now;

        // If it was paused, add elapsed time to counter
        // (now - existing.lastSeen) in ms, convert to seconds
        const elapsed = (now - existing.lastSeen) / 1000;
        if (elapsed > 0) {
          pausedCounter += Math.round(elapsed);
        }
      } else {
        // Not paused
        pausedSince = null;
      }

      updateActive.run({
        lastSeen: now,
        state: session.state,
        sessionId: session.id,
        meta_json: JSON.stringify(session),
        pausedCounter,
        pausedSince
      });
    } else {
      // New session started
      newSessions.push(session);

      const viewOffset = session.viewOffset || 0;
      const calculatedStartTime = now - viewOffset;

      insertActive.run({
        sessionId: session.id,
        serverId,
        user: session.user,
        title: session.title,
        subtitle: session.subtitle,
        ratingKey: session.id,
        startTime: calculatedStartTime,
        lastSeen: now,
        state: session.state,
        platform: session.platform,
        device: session.device,
        meta_json: JSON.stringify(session),
        pausedCounter: 0,
        pausedSince: isPaused ? now : null
      });
    }
  }

  // 2. Process ended sessions: If in DB but not in current list
  const currentIds = new Set(currentSessions.map((s) => s.id));

  for (const stored of storedSessions) {
    if (!currentIds.has(stored.sessionId)) {
      // Session has ended. Log it to history.
      const timeSinceLastSeen = (now - stored.lastSeen) / 1000;
      const effectiveStopTime = timeSinceLastSeen > 60 ? stored.lastSeen : now;
      const durationSeconds = Math.round((effectiveStopTime - stored.startTime) / 1000);

      // Only log if it lasted more than a reasonable amount (e.g. 10s)
      if (durationSeconds > 10) {
        const historyEntry: HistoryEntry = {
          id: crypto.randomUUID(),
          serverId,
          user: stored.user,
          title: stored.title,
          subtitle: stored.subtitle,
          ratingKey: stored.ratingKey,
          startTime: stored.startTime,
          stopTime: effectiveStopTime,
          duration: durationSeconds,
          platform: stored.platform,
          device: stored.device,
          ip: undefined, // IP not currently extracted from session
          meta_json: stored.meta_json || undefined,
          pausedCounter: stored.pausedCounter,
          // Add thumbs if we can recover them from meta_json or stored fields (not stored currently)
        };

        insertHistory.run(historyEntry);
        endedSessions.push(historyEntry);
      }

      // Remove from active
      deleteActive.run({ sessionId: stored.sessionId });
    }
  }

  return { newSessions, endedSessions };
};

export type HistoryParams = {
  page?: number;
  pageSize?: number;
  serverId?: string;
  userId?: string;
  search?: string;
};

export type HistoryResult = {
  data: HistoryEntry[];
  totalActionCount: number; // Total count of stored history matching filters
  activeSessions: HistoryEntry[];
};

export const getHistory = (params: HistoryParams = {}): HistoryResult => {
  const { page = 1, pageSize = 25, serverId, userId, search } = params;
  const offset = (page - 1) * pageSize;

  // Base conditions
  const conditions: string[] = [];
  const args: any[] = [];

  if (serverId && serverId !== "all") {
    conditions.push("h.serverId = ?");
    args.push(serverId);
  }

  if (userId && userId !== "all") {
    conditions.push("h.user = ?");
    args.push(userId);
  }

  if (search) {
    conditions.push("h.title LIKE ?");
    args.push(`%${search}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // 1. Get Stored History
  const historyQuery = `
    SELECT h.*, s.name as serverName 
    FROM activity_history h
    LEFT JOIN servers s ON h.serverId = s.id
    ${whereClause}
    ORDER BY h.startTime DESC
    LIMIT ? OFFSET ?
  `;

  // 2. Get Total Count for Pagination
  const countQuery = `
    SELECT COUNT(*) as count
    FROM activity_history h
    ${whereClause}
  `;

  const historyEntries = db.prepare(historyQuery).all(...args, pageSize, offset) as HistoryEntry[];
  const totalCount = (db.prepare(countQuery).get(...args) as any).count;

  // 3. Get Active Sessions (Only needed on page 1, or always? Let's get always for simplicity or only page 1)
  // Usually active sessions should be at the top of page 1.
  // We will return them separately and let the UI prepend them if on page 1.
  let activeHistory: HistoryEntry[] = [];

  // Filter active sessions by same criteria (in memory, as table scan is cheap for active)
  const activeQuery = serverId && serverId !== "all"
    ? getActiveSessions
    : getAllActiveSessions;

  const activeRows = (serverId && serverId !== "all" ? activeQuery.all({ serverId }) : activeQuery.all()) as ActiveSessionRow[];

  activeHistory = activeRows.map(row => {
    const now = Date.now();
    const duration = Math.round((now - row.startTime) / 1000);

    return {
      id: `active-${row.sessionId}`,
      serverId: row.serverId,
      user: row.user,
      title: row.title,
      subtitle: row.subtitle,
      ratingKey: row.ratingKey,
      startTime: row.startTime,
      stopTime: 0,
      duration: duration,
      platform: row.platform,
      device: row.device,
      ip: undefined,
      serverName: row.serverName || "Unknown",
      meta_json: row.meta_json,
      pausedCounter: row.pausedCounter
    };
  }).filter(entry => {
    let match = true;
    if (userId && userId !== "all" && entry.user !== userId) match = false;
    if (search && !entry.title.toLowerCase().includes(search.toLowerCase())) match = false;
    return match;
  });

  return {
    data: historyEntries,
    totalActionCount: totalCount,
    activeSessions: activeHistory
  };
};

export const getAllHistory = (params: { start?: number; end?: number; userId?: string } = {}): HistoryEntry[] => {
  const { start, end, userId } = params;
  const conditions: string[] = [];
  const args: any[] = [];

  if (start) {
    conditions.push("h.startTime >= ?");
    args.push(start);
  }

  if (end) {
    conditions.push("h.startTime <= ?");
    args.push(end);
  }

  // Optional: filter by specific user if requested, though "Rewrap" for friend might imply "all" or specific.
  // We'll support it just in case.
  if (userId) {
    conditions.push("h.user = ?");
    args.push(userId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT h.*, s.name as serverName 
    FROM activity_history h
    LEFT JOIN servers s ON h.serverId = s.id
    ${whereClause}
    ORDER BY h.startTime ASC
  `;

  return db.prepare(query).all(...args) as HistoryEntry[];
};

export const deleteHistory = (ids: string[]) => {
  const deleteTransaction = db.transaction((idsToDelete: string[]) => {
    for (const id of idsToDelete) {
      deleteHistoryById.run({ id });
    }
  });
  deleteTransaction(ids);
};

export const addHistoryEntry = (entry: HistoryEntry) => {
  insertHistory.run(entry);
};

const deleteAll = db.prepare("DELETE FROM activity_history");

export const deleteAllHistory = () => {
  deleteAll.run();
};
