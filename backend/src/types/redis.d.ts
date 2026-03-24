declare module 'redis' {
  export type RedisClientType = {
    isOpen: boolean;
    on(event: 'error', listener: (error: unknown) => void): RedisClientType;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, options?: { EX?: number }): Promise<'OK' | string | null>;
    del(keys: string | string[]): Promise<number>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    ttl(key: string): Promise<number>;
  };

  export function createClient(options?: { url?: string }): RedisClientType;
}
