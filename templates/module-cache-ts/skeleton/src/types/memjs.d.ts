// ── Ambient types for memjs ────────────────────────────────────────
//
// memjs ships no type declarations and there is no @types/memjs.
// This declares the subset of the API the memcached provider uses.
//

declare module "memjs" {
  /** Options accepted by Client.create. */
  export interface ClientOptions {
    username?: string;
    password?: string;
    expires?: number;
    [key: string]: unknown;
  }

  /** Options accepted by Client#set. */
  export interface SetOptions {
    expires?: number;
    [key: string]: unknown;
  }

  /** Result shape returned by Client#get. */
  export interface GetResult {
    value: Buffer | null;
    flags: Buffer | null;
  }

  export class Client {
    /** Construct a client from a comma-separated server list. */
    static create(servers?: string, options?: ClientOptions): Client;

    get(key: string): Promise<GetResult>;
    set(key: string, value: string | Buffer, options?: SetOptions): Promise<boolean>;
    delete(key: string): Promise<boolean>;
    flush(): Promise<Record<string, boolean | Error>>;
    close(): void;
  }

  const memjs: {
    Client: typeof Client;
  };

  export default memjs;
}
