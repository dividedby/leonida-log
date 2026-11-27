import type { PoliteFetchDeps } from "./fetch/politeFetch";

export interface FakeResponse {
  status?: number;
  body?: string | Uint8Array | null;
  headers?: Record<string, string>;
}

export interface FakeCall {
  url: string;
  headers: Record<string, string>;
  /** Fake clock reading when the request was made. */
  at: number;
}

/** A routes entry may be a list: responses are served in order and the last one repeats. */
export type FakeRoutes = Record<string, FakeResponse | FakeResponse[]>;

export interface FakeClock {
  now(): number;
  sleep(ms: number): Promise<void>;
  sleeps: number[];
}

export function fakeClock(start = 1_000_000): FakeClock {
  let t = start;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

/** In-memory network: URL → response. Unknown URLs, robots.txt included, answer 404. */
export function fakeNetwork(routes: FakeRoutes, clock = fakeClock()) {
  const calls: FakeCall[] = [];
  const queues = new Map<string, FakeResponse[]>();

  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>).map(
        ([k, v]) => [k.toLowerCase(), v],
      ),
    );
    calls.push({ url, headers, at: clock.now() });
    const route = routes[url];
    let r: FakeResponse | undefined;
    if (Array.isArray(route)) {
      const q = queues.get(url) ?? [...route];
      queues.set(url, q);
      r = q.length > 1 ? q.shift() : q[0];
    } else {
      r = route;
    }
    const status = r?.status ?? (r ? 200 : 404);
    const body =
      status === 304 || (status >= 300 && status < 400)
        ? null
        : (r?.body ?? "");
    return new Response(body as BodyInit | null, {
      status,
      headers: r?.headers,
    });
  }) as unknown as typeof fetch;

  const deps: PoliteFetchDeps = {
    fetch: fetchFn,
    now: clock.now,
    sleep: clock.sleep,
  };
  return {
    deps,
    calls,
    clock,
    /** Requests to anything but robots.txt. */
    pageCalls: () => calls.filter((c) => !c.url.endsWith("/robots.txt")),
  };
}
