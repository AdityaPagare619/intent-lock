/**
 * workers/indexedb_bunker.ts — the Offline Vibe Bunker (E5).
 *
 * REAL IndexedDB ring buffer. At session start the simulator pre-caches
 * preview buffers here; when the ISP toggle flips, playback crossfades
 * into the cache with zero dead air — no network involved.
 *
 * BunkerPlayer wraps an AudioContext for gapless crossfade + local
 * pause/skip that keep working fully offline.
 */

export interface BunkerTrack {
  id: string;
  title: string;
  url: string;
  bytes: number;
  cachedAt: number;
}

const DB_NAME = "omnibeat-vibe-bunker";
const STORE = "chunks";
const MAX_TRACKS = 8; // ring eviction: oldest goes first

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface StoredChunk extends BunkerTrack {
  data: ArrayBuffer;
}

/** Fetch a URL and store its bytes. Evicts oldest beyond MAX_TRACKS. */
export async function bunkerCacheTrack(id: string, title: string, url: string): Promise<BunkerTrack> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bunker fetch failed: ${url} (${res.status})`);
  const data = await res.arrayBuffer();
  const db = await openDb();
  const rec: StoredChunk = { id, title, url, bytes: data.byteLength, cachedAt: Date.now(), data };
  await tx(db, "readwrite", (s) => s.put(rec));
  // ring eviction
  const all = await tx<StoredChunk[]>(db, "readonly", (s) => s.getAll());
  if (all.length > MAX_TRACKS) {
    const evict = all.sort((a, b) => a.cachedAt - b.cachedAt).slice(0, all.length - MAX_TRACKS);
    for (const e of evict) await tx(db, "readwrite", (s) => s.delete(e.id));
  }
  db.close();
  return { id, title, url, bytes: data.byteLength, cachedAt: rec.cachedAt };
}

export async function bunkerList(): Promise<BunkerTrack[]> {
  const db = await openDb();
  const all = await tx<StoredChunk[]>(db, "readonly", (s) => s.getAll());
  db.close();
  return all
    .sort((a, b) => a.cachedAt - b.cachedAt)
    .map(({ id, title, url, bytes, cachedAt }) => ({ id, title, url, bytes, cachedAt }));
}

export async function bunkerGet(id: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  const rec = await tx<StoredChunk | undefined>(db, "readonly", (s) => s.get(id));
  db.close();
  return rec ? rec.data : null;
}

export async function bunkerClear(): Promise<void> {
  const db = await openDb();
  await tx(db, "readwrite", (s) => s.clear());
  db.close();
}

/**
 * Gapless local player over the bunker. crossfadeTo() decodes the cached
 * buffer and ramps gains — the "zero dead air" mechanism, fully offline.
 */
export class BunkerPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private cur: { src: AudioBufferSourceNode; gain: GainNode; id: string } | null = null;
  private decoded = new Map<string, AudioBuffer>();
  private _playing = false;

  get currentId(): string | null {
    return this.cur?.id ?? null;
  }
  get isPlaying(): boolean {
    return this._playing;
  }

  /** Must be called from a user gesture at least once. */
  async ensure(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  private async decode(id: string): Promise<AudioBuffer | null> {
    await this.ensure();
    const hit = this.decoded.get(id);
    if (hit) return hit;
    const raw = await bunkerGet(id);
    if (!raw || !this.ctx) return null;
    // decodeAudioData detaches the buffer; copy first since IDB gives it to us fresh each get
    const buf = await this.ctx.decodeAudioData(raw.slice(0));
    this.decoded.set(id, buf);
    return buf;
  }

  /** Crossfade into a cached track. Returns false if the id isn't cached. */
  async crossfadeTo(id: string, fadeSec = 1.1): Promise<boolean> {
    const buf = await this.decode(id);
    if (!buf || !this.ctx || !this.master) return false;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.9, t + fadeSec);
    src.connect(gain).connect(this.master);
    src.start(t);
    const prev = this.cur;
    if (prev) {
      prev.gain.gain.cancelScheduledValues(t);
      prev.gain.gain.setValueAtTime(Math.max(0.0001, prev.gain.gain.value), t);
      prev.gain.gain.exponentialRampToValueAtTime(0.0001, t + fadeSec);
      prev.src.stop(t + fadeSec + 0.05);
    }
    this.cur = { src, gain, id };
    this._playing = true;
    return true;
  }

  pause(): void {
    if (this.ctx && this.ctx.state === "running") {
      void this.ctx.suspend();
      this._playing = false;
    }
  }

  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
      this._playing = true;
    }
  }

  stop(): void {
    const prev = this.cur;
    this.cur = null;
    this._playing = false;
    if (prev && this.ctx) {
      try {
        prev.gain.gain.cancelScheduledValues(this.ctx.currentTime);
        prev.src.stop();
      } catch {
        /* already stopped */
      }
    }
  }
}

/** The 5 emergency vibe tracks cached at session start (royalty-free local motifs). */
export const BUNKER_SEED_TRACKS = [
  { id: "bunker-lollipop", title: "Lollipop Lagelu — Pawan Singh", url: "/hooks/lollipop-lagelu-studio.wav" },
  { id: "bunker-raja-ji", title: "Raja Ji — Pawan Singh", url: "/hooks/raja-ji-studio.wav" },
  { id: "bunker-raja-ji-alt", title: "Raja Ji — Khesari Lal Yadav", url: "/hooks/raja-ji-studio-alt.wav" },
  { id: "bunker-yaad", title: "Mujhe Tum Yaad Aate Ho", url: "/hooks/mujhe-tum-yaad-studio.wav" },
  { id: "bunker-despacito", title: "Despacito — Luis Fonsi", url: "/hooks/despacito-studio.wav" },
];
