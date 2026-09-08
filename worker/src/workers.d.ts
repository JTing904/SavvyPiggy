/**
 * Just enough of the Workers runtime for this one file to typecheck inside
 * the app's own tsconfig. Adding @cloudflare/workers-types would pull a large
 * dependency into a project that ships a phone app, for two interfaces.
 */

interface KVNamespace {
  get(key: string, type: 'text'): Promise<string | null>;
  get<T>(key: string, type: 'json'): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }>;
}

interface ScheduledController {
  readonly scheduledTime: number;
  readonly cron: string;
}
