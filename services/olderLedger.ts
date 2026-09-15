import type { Activity } from '../types';

export type OlderStatus = 'ready' | 'loading' | 'failed';

/** Reads the rows in [from, to), from the server. */
export type OlderLoader = (from: Date, to: Date) => Promise<Activity[]>;

/**
 * The part of the kept ledger older than the live window, read on demand.
 *
 * Coverage only ever grows backwards from the live window's start in one
 * unbroken stretch, so "loaded from X" always means every row from X up to the
 * live rows is here — a screen never sums a month with a hole in it. Each
 * stretch is read once per session; a failed read waits for `retry` rather
 * than hammering the server (or a phone with no signal) on every render.
 */
export class OlderLedger {
  private rows = new Map<string, Activity>();
  private from: Date | null = null;
  private wanted: number | null = null;
  private busy = false;
  private failed = false;
  private closed = false;
  private listeners = new Set<() => void>();
  private cached: Activity[] | null = null;
  /** Bumped on every change, for useSyncExternalStore. */
  version = 0;

  constructor(
    readonly liveFrom: Date,
    private readonly load: OlderLoader
  ) {}

  /** The first moment loaded: the live window's start until something older is read. */
  get loadedFrom() {
    return this.from ?? this.liveFrom;
  }

  get list(): Activity[] {
    if (!this.cached) this.cached = [...this.rows.values()];
    return this.cached;
  }

  has(id: string) {
    return this.rows.has(id);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  private emit() {
    this.version += 1;
    this.cached = null;
    this.listeners.forEach((l) => l());
  }

  covers(from: Date) {
    return from.getTime() >= this.loadedFrom.getTime();
  }

  status(from: Date | null): OlderStatus {
    if (!from || this.covers(from)) return 'ready';
    return this.failed ? 'failed' : 'loading';
  }

  /** Asks for everything from `from` up to the live window. */
  need(from: Date | null) {
    if (!from || this.closed || this.covers(from)) return;
    const ms = from.getTime();
    if (this.wanted === null || ms < this.wanted) this.wanted = ms;
    if (!this.failed) void this.pump();
  }

  retry() {
    if (!this.failed || this.closed) return;
    this.failed = false;
    this.emit();
    void this.pump();
  }

  get isFailed() {
    return this.failed;
  }

  /** Whether any stretch older than the live window has been read yet. */
  get hasOlder() {
    return this.from !== null;
  }

  /**
   * A row changed on this phone: `row` is its new state, null when it is gone.
   * A row not seen before is taken in when it falls inside what is loaded — a
   * back-dated catch-up deposit written after that stretch was read, say.
   * Says whether the older ledger changed.
   */
  patch(id: string, row: Activity | null): boolean {
    const inside =
      row !== null &&
      this.from !== null &&
      row.date >= this.from.toISOString() &&
      row.date < this.liveFrom.toISOString();
    if (inside) this.rows.set(id, row);
    else if (!this.rows.delete(id)) return false;
    this.emit();
    return true;
  }

  close() {
    this.closed = true;
    this.listeners.clear();
  }

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    this.emit();
    try {
      while (!this.closed && this.wanted !== null && this.wanted < this.loadedFrom.getTime()) {
        const from = new Date(this.wanted);
        const got = await this.load(from, this.loadedFrom);
        if (this.closed) return;
        got.forEach((a) => this.rows.set(a.id, a));
        this.from = from;
        this.emit();
      }
    } catch {
      this.failed = true;
    } finally {
      this.busy = false;
      if (!this.closed) this.emit();
    }
  }
}
