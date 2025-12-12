import { XMLParser } from "fast-xml-parser";
import { getSetting } from "./settings";

type RawPart = {
  decision?: string;
  [key: string]: unknown;
};

type RawMedia = {
  Part?: RawPart | RawPart[];
  videoResolution?: string;
  height?: string | number;
  bitrate?: string | number;
  [key: string]: unknown;
};

type RawVideo = {
  Media?: RawMedia | RawMedia[];
  TranscodeSession?: {
    videoDecision?: string;
    audioDecision?: string;
    subtitleDecision?: string;
    container?: string;
    videoCodec?: string;
    audioCodec?: string;
    height?: string | number;
    audioChannels?: string | number;
    [key: string]: unknown;
  };
  Session?: { bandwidth?: string | number; location?: string };
  Player?: { platform?: string; product?: string; title?: string; state?: string; address?: string; remotePublicAddress?: string };
  User?: { title?: string };
  ratingKey?: string;
  key?: string;
  summary?: string;
  tagline?: string;
  grandparentTitle?: string;
  parentTitle?: string;
  title?: string;
  duration?: string | number;
  viewOffset?: string | number;
  thumb?: string;
  parentThumb?: string; // Season poster
  grandparentThumb?: string; // Series poster
  parentIndex?: string | number; // Season number
  index?: string | number; // Episode number
  [key: string]: unknown;
};

type RawDirectory = {
  key?: string;
  title?: string;
  type?: string;
  agent?: string;
  location?: string;
  childCount?: string | number;
  leafCount?: string | number;
  refreshing?: string | number;
  [key: string]: unknown;
};

type RawSessionsResponse = {
  MediaContainer?: {
    size?: string | number;
    friendlyName?: string;
    Video?: RawVideo | RawVideo[];
  };
};

type RawLibrariesResponse = {
  MediaContainer?: {
    Directory?: RawDirectory | RawDirectory[];
  };
};

export type PlexServerConfig = {
  id?: string;
  name?: string;
  baseUrl: string;
  token: string;
};

export type PlexSession = {
  id: string;
  title: string;
  subtitle?: string;
  user: string;
  platform?: string;
  device?: string;
  state: string;
  bandwidth: number;
  decision?: string;
  quality?: string;
  location?: string;
  progressPercent: number | null;
  duration: number;
  viewOffset: number;
  resolution?: string;
  thumb?: string;
  serverName?: string;
  serverId?: string;
  year?: string;
  player?: string;
  container?: string;
  ip?: string;
  videoDecision?: string;
  audioDecision?: string;
  subtitleDecision?: string;
  isOriginalQuality: boolean;
  originalContainer?: string;
  transcodeContainer?: string;
  originalVideoCodec?: string;
  transcodeVideoCodec?: string;
  originalAudioCodec?: string;
  transcodeAudioCodec?: string;
  originalAudioChannels?: string;
  transcodeAudioChannels?: string;
  originalHeight?: string;
  transcodeHeight?: string;
};

export type LibrarySection = {
  key: string;
  title: string;
  type?: string;
  agent?: string;
  count: number;
  refreshing: boolean;
};

export type SessionSummary = {
  active: number;
  directPlay: number;
  transcoding: number;
  paused: number;
  bandwidth: number;
  serverName?: string;
};



const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  processEntities: true,
  parseTagValue: true, // Needed to ensure values are processed
});

const toArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const resolveServer = (server?: PlexServerConfig): PlexServerConfig => {
  if (server?.baseUrl && server?.token) {
    return { ...server, baseUrl: server.baseUrl.replace(/\/$/, "") };
  }

  const baseUrl = process.env.PLEX_BASE_URL;
  const token = process.env.PLEX_TOKEN;

  if (!baseUrl || !token) {
    throw new Error("Ingen Plex-server är konfigurerad. Lägg till en server i inställningar.");
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    token,
    name: "Standard Plex",
  };
};

export const plexFetch = async (
  path: string,
  params: Record<string, string | number> = {},
  server?: PlexServerConfig,
) => {
  const { baseUrl, token } = resolveServer(server);
  const url = new URL(`${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`);

  url.searchParams.set("X-Plex-Token", token);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/xml",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Plex request failed: ${response.status} ${response.statusText} - ${message}`);
    }

    return parser.parse(await response.text());
  } catch (error: any) {
    if (error.cause?.code === 'ECONNREFUSED') {
      const port = url.port || (url.protocol === 'https:' ? '443' : '80');
      if (port === '80' || port === '443') {
        throw new Error(`Kunde inte ansluta till Plex på '${baseUrl}'. Anslutning nekades på port ${port}. Glömde du att ange porten (t.ex. :32400)?`);
      }
      throw new Error(`Kunde inte ansluta till Plex på '${baseUrl}'. Kontrollera att servern är igång och nåbar.`);
    }
    throw error;
  }
};

const decodePlexString = (str?: string): string => {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&aring;/g, "å")
    .replace(/&Aring;/g, "Å")
    .replace(/&auml;/g, "ä")
    .replace(/&Auml;/g, "Ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
};

const formatTitle = (video: RawVideo) => {
  if (video.grandparentTitle) {
    const episode = video.title ? ` • ${decodePlexString(video.title)}` : "";
    const season = video.parentTitle ? ` — ${decodePlexString(video.parentTitle)}` : "";
    return `${decodePlexString(video.grandparentTitle)}${season}${episode}`;
  }

  return decodePlexString(video.title) || "Unknown title";
};

export const fetchSessions = async (
  server?: PlexServerConfig,
): Promise<{
  sessions: PlexSession[];
  summary: SessionSummary;
}> => {
  const xml = (await plexFetch("/status/sessions", {}, server)) as RawSessionsResponse;
  const container = xml.MediaContainer ?? {};
  const videos = toArray(container.Video);

  let directPlay = 0;
  let transcoding = 0;
  let paused = 0;
  let bandwidth = 0;

  // Resolve server config to build full image URLs
  const { baseUrl, token } = resolveServer(server);

  const sessions = videos.map((video): PlexSession => {
    const media = toArray(video.Media)[0] ?? {};
    const part = toArray(media.Part)[0] ?? {};
    const transcode = video.TranscodeSession ?? {};
    const session = video.Session ?? {};
    const player = video.Player ?? {};

    const normalizeDecision = (d: string | undefined) => {
      if (!d) return "direct play";
      const lower = d.toLowerCase();
      return lower === "copy" ? "direct stream" : lower;
    };

    const videoDecision = normalizeDecision(transcode.videoDecision);
    const audioDecision = normalizeDecision(transcode.audioDecision);
    const subtitleDecision = normalizeDecision(transcode.subtitleDecision);

    const decision =
      videoDecision !== "direct play" ? videoDecision :
        (part.decision as string | undefined) ||
        undefined;

    const normalizedDecision = decision?.toLowerCase() ?? "unknown";
    if (normalizedDecision.includes("transcode")) {
      transcoding += 1;
    } else {
      directPlay += 1;
    }

    if ((player.state as string | undefined)?.toLowerCase() === "paused") {
      paused += 1;
    }

    const sessionBandwidth = Number(session.bandwidth ?? 0);
    bandwidth += Number.isFinite(sessionBandwidth) ? sessionBandwidth : 0;

    const duration = Number(video.duration ?? 0);
    const viewOffset = Number(video.viewOffset ?? 0);
    const progressPercent =
      duration > 0 ? Math.min(100, Math.round((viewOffset / duration) * 100)) : null;

    const resolution =
      media.videoResolution ||
      (media.height ? `${media.height}p` : undefined) ||
      undefined;

    const quality = media.bitrate
      ? `${Math.round(Number(media.bitrate) / 1000)} Mbps`
      : undefined;

    // Determine if it's a TV Show (has grandparentTitle)
    const isTV = !!video.grandparentTitle;

    // Title Formatting
    let title = decodePlexString(video.title) || "Unknown title";
    if (isTV) {
      title = `${decodePlexString(video.grandparentTitle)} — ${title}`;
    }

    // Subtitle Formatting
    let subtitle = decodePlexString(video.summary || video.tagline);
    if (isTV && video.parentIndex && video.index) {
      subtitle = `S${video.parentIndex} E${video.index}`;
    }

    // Thumbnail Logic (User prefers Season Poster 'parentThumb' for TV)
    const thumbKey = isTV ? (video.parentThumb || video.thumb) : video.thumb;
    const thumbUrl = thumbKey
      ? `${baseUrl}${thumbKey}?X-Plex-Token=${token}`
      : undefined;

    return {
      id: video.ratingKey || video.key || crypto.randomUUID(),
      title,
      subtitle,
      user: decodePlexString(video.User?.title) || "Okänd användare",
      platform: player.platform || player.product || undefined,
      device: player.title || undefined,
      state: player.state || "unknown",
      bandwidth: sessionBandwidth,
      decision: decision ?? "unknown",
      quality,
      location: session.location || undefined,
      progressPercent,
      duration,
      viewOffset,
      resolution,
      thumb: thumbUrl,
      serverName: server?.name || container.friendlyName,
      serverId: server?.id,
      year: video.year as string | undefined,
      player: player.product || player.platform || player.title || "Unknown Player",
      container: (media.container as string) || (video.container as string) || undefined,
      ip: player.remotePublicAddress || player.address || undefined,
      videoDecision,
      audioDecision,
      subtitleDecision,
      isOriginalQuality: videoDecision === "direct play" || videoDecision === "direct stream",
      originalContainer: (media.container as string) || (video.container as string) || undefined,
      transcodeContainer: (transcode.container as string) || undefined,
      originalVideoCodec: (media.videoCodec as string) || undefined,
      transcodeVideoCodec: (transcode.videoCodec as string) || undefined,
      originalAudioCodec: (media.audioCodec as string) || undefined,
      transcodeAudioCodec: (transcode.audioCodec as string) || undefined,
      originalAudioChannels: (media.audioChannels as string) || undefined,
      transcodeAudioChannels: (transcode.audioChannels as string) || undefined,
      originalHeight: (media.height as string) || undefined,
      transcodeHeight: (transcode.height as string) || undefined,
    };
  });

  return {
    sessions,
    summary: {
      active: videos.length,
      directPlay,
      transcoding,
      paused,
      bandwidth,
      serverName: server?.name || container.friendlyName,
    },
  };
};

export const fetchLibraries = async (
  server?: PlexServerConfig,
): Promise<LibrarySection[]> => {
  // Counts are not returned effectively by /library/sections without extra queries per library.
  // Leaving as 0 for now to avoid N+1 slow queries.
  const xml = (await plexFetch("/library/sections", {}, server)) as RawLibrariesResponse;
  const directories = toArray(xml.MediaContainer?.Directory);

  return directories.map((library) => {
    // Attempt to grab count if available, otherwise 0
    const count = Number(library.leafCount ?? library.childCount ?? 0);


    return {
      key: library.key || crypto.randomUUID(),
      title: library.title || "Okänt bibliotek",
      type: library.type,
      agent: library.agent,
      count,
      refreshing: Boolean(Number(library.refreshing ?? 0)),
    };
  });
};

export const getDashboardSnapshot = async (server?: PlexServerConfig) => {
  const [sessions, libraries] = await Promise.all([
    fetchSessions(server),
    fetchLibraries(server),
  ]);

  return {
    sessions: sessions.sessions,
    summary: sessions.summary,
    libraries,
    updatedAt: new Date().toISOString(),
    appName: getSetting("APP_NAME"),
  };
};

export interface PlexUser {
  id: string;
  title: string;
  username: string;
  email: string;
  thumb: string;
  filterAll: string;
  filterMovies: string;
  filterMusic: string;
  filterPhotos: string;
  filterTelevision: string;
  serverName: string;
}

export const fetchPlexUsers = async (
  server: PlexServerConfig,
): Promise<PlexUser[]> => {
  const { baseUrl, token } = resolveServer(server);

  const parseUsers = (xml: any) => {
    const container = xml.MediaContainer ?? {};
    const users = toArray(container.User);
    return users.map((u: any) => ({
      id: u.id,
      title: decodePlexString(u.title),
      username: decodePlexString(u.username),
      email: u.email,
      thumb: u.thumb,
      filterAll: u.filterAll,
      filterMovies: u.filterMovies,
      filterMusic: u.filterMusic,
      filterPhotos: u.filterPhotos,
      filterTelevision: u.filterTelevision,
      serverName: server?.name || "Unknown",
    }));
  };

  try {
    // 1. Try Local Server
    try {
      const xml = (await plexFetch("/users", {}, server)) as any;
      const users = parseUsers(xml);
      if (users.length > 0) return users;
    } catch (e) {
      // Ignore local error, try cloud
      // console.warn("Local user fetch failed, trying cloud...");
    }

    // 2. Try Plex.tv Cloud API (Fallback)
    const cloudUrl = `https://plex.tv/api/users?X-Plex-Token=${token}`;
    const res = await fetch(cloudUrl, { headers: { Accept: "application/xml" } });
    if (!res.ok) throw new Error(`Cloud fetch failed: ${res.status}`);

    const text = await res.text();
    const xml = parser.parse(text);
    return parseUsers(xml);

  } catch (error) {
    console.error(`Failed to fetch users for ${server?.name}:`, error);
    return [];
  }
};
