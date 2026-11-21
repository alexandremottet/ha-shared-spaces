export type ClockListener = (now: number) => void;

export class MockClock {
  private _now: number;
  private _speed = 1;
  private _playing = false;
  private _last = 0;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _listeners = new Set<ClockListener>();
  readonly timeZone: string;

  constructor(start: number = Date.now(), timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    this._now = start;
    this.timeZone = timeZone;
  }

  now = (): number => this._now;
  get speed(): number {
    return this._speed;
  }
  get playing(): boolean {
    return this._playing;
  }

  set(ms: number): void {
    this._now = ms;
    this._last = performance.now();
    this._emit();
  }

  advance(ms: number): void {
    this.set(this._now + ms);
  }

  setSpeed(speed: number): void {
    this._speed = speed;
    this._emit();
  }

  play(): void {
    if (this._playing) return;
    this._playing = true;
    this._last = performance.now();
    this._timer = setInterval(() => this._tick(), 250);
    this._emit();
  }

  pause(): void {
    if (!this._playing) return;
    this._playing = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this._emit();
  }

  subscribe(listener: ClockListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  dispose(): void {
    this.pause();
    this._listeners.clear();
  }

  private _tick(): void {
    const t = performance.now();
    this._now += (t - this._last) * this._speed;
    this._last = t;
    this._emit();
  }

  private _emit(): void {
    for (const l of [...this._listeners]) l(this._now);
  }
}
