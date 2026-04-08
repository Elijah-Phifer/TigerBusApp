const ALL_ROUTE_IDS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,22,23];

type RawArrivalEntry = {
  RouteId: number | string;
  Times: { Seconds: number }[];
};

export type ArrivalEntry = {
  routeId: number;
  times: { seconds: number }[];
};

export type ActiveRouteData = {
  /** Set of route IDs that have at least one bus currently running */
  activeRouteIds: Set<number>;
  /** Map from routeId → first arrival entry, for "next bus" display */
  arrivals: Map<number, ArrivalEntry>;
};

/**
 * Fetches live arrival data from TransLoc and returns which routes are
 * currently active (have buses running) plus their next arrival times.
 *
 * Falls back to treating ALL routes as active if the fetch fails, so
 * the app still works when offline or the API is down.
 */
export async function fetchActiveRoutes(): Promise<ActiveRouteData> {
  const ids = ALL_ROUTE_IDS.join(',');
  const url =
    `https://lsu.transloc.com/Services/JSONPRelay.svc/GetStopArrivalTimes` +
    `?apiKey=8882812681&routeIds=${ids}&version=2`;

  try {
    const res = await fetch(url);
    const raw: RawArrivalEntry[] = await res.json();

    const activeRouteIds = new Set<number>();
    const arrivals = new Map<number, ArrivalEntry>();

    for (const entry of raw) {
      if (!entry.Times || entry.Times.length === 0) continue;
      const routeId = Number(entry.RouteId); // ensure numeric
      activeRouteIds.add(routeId);
      // Keep only the first-seen arrival entry per route (earliest stop)
      if (!arrivals.has(routeId)) {
        arrivals.set(routeId, {
          routeId,
          times: entry.Times.map((t) => ({ seconds: t.Seconds })),
        });
      }
    }

    // If the API returned nothing active, fall back to all routes so the
    // app still shows results (route might be active but no live GPS yet)
    if (activeRouteIds.size === 0) {
      return fallbackAllActive();
    }

    return { activeRouteIds, arrivals };
  } catch {
    return fallbackAllActive();
  }
}

function fallbackAllActive(): ActiveRouteData {
  return {
    activeRouteIds: new Set(ALL_ROUTE_IDS),
    arrivals: new Map(),
  };
}
