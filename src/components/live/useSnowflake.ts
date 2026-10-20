import { useCallback, useEffect, useRef, useState } from 'react';
import { errorCopy, SNOWFLAKE_SERVER, SNOWFLAKE_TOOL, snowflakeRows } from '../../lib/cfo437/live.ts';

type Mcp = {
  callTool: (server: string, tool: string, input?: unknown, opts?: unknown) => Promise<{ payload?: unknown }>;
  listTools: (server?: string) => Promise<{ servers: { server: string }[] }>;
};

export type Rows = Record<string, string | null>[];

/** Read-only Snowflake access through the viewer's claude.ai connector (artifact `mcp` capability). */
export function useSnowflake() {
  const [mcp, setMcp] = useState<Mcp | null | undefined>(undefined);
  const server = useRef(SNOWFLAKE_SERVER);

  useEffect(() => {
    let alive = true;
    const use = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude?.use;
    if (!use) {
      setMcp(null);
      return;
    }
    use('mcp')
      .then(async m => {
        if (!alive) return;
        const handle = (m as Mcp) ?? null;
        if (handle) {
          try {
            const { servers } = await handle.listTools();
            server.current =
              servers.find(s => s.server === SNOWFLAKE_SERVER)?.server ?? servers.find(s => /snowflake.*analyst/i.test(s.server))?.server ?? SNOWFLAKE_SERVER;
          } catch {
            /* keep declared name */
          }
        }
        if (alive) setMcp(handle);
      })
      .catch(() => alive && setMcp(null));
    return () => {
      alive = false;
    };
  }, []);

  const query = useCallback(
    async (sql: string): Promise<Rows> => {
      if (!mcp) throw { code: 'unavailable' };
      const run = () => mcp.callTool(server.current, SNOWFLAKE_TOOL, { sql }, { cache: false });
      let res;
      try {
        res = await run();
      } catch (e) {
        const err = e as { retryable?: boolean; retryAfterMs?: number };
        if (!err?.retryable) throw e;
        await new Promise(r => setTimeout(r, Math.min(err.retryAfterMs ?? 1500, 10000) + Math.random() * 500));
        res = await run();
      }
      return snowflakeRows(res.payload);
    },
    [mcp],
  );

  return { available: mcp, query };
}

export const describeError = (e: unknown) => {
  const code = (e as { code?: string })?.code ?? 'upstream_error';
  return errorCopy(code, 'Snowflake');
};

export const nowStamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
