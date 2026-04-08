import { BUS_STOPS, UniqueStop } from '../app/busStops';
import { BUS_ROUTES, BusRoute } from '../app/busRouteData';
import { isNearRoute, haversineMeters, GeoPoint } from './routeMatching';
import { ActiveRouteData } from './transitSchedule';

export type { GeoPoint };

/**
 * Fetches a walking path between two points using the OSRM public routing API.
 * Falls back to a straight line if the request fails.
 */
export async function fetchWalkingPath(from: GeoPoint, to: GeoPoint): Promise<GeoPoint[]> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/foot/` +
      `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return [from, to];
    return (data.routes[0].geometry.coordinates as number[][]).map(
      ([lng, lat]) => ({ latitude: lat, longitude: lng })
    );
  } catch {
    return [from, to]; // straight-line fallback
  }
}

export type WalkingPaths = {
  toBoard: GeoPoint[];    // origin → board stop
  fromAlight: GeoPoint[]; // alight stop → destination
};

/** Stops within radiusMeters of a point */
function stopsNearPoint(point: GeoPoint, radius: number): UniqueStop[] {
  return BUS_STOPS.filter((s) => haversineMeters(s, point) <= radius);
}

function closestStop(stops: UniqueStop[], point: GeoPoint): UniqueStop {
  return stops.reduce((best, s) =>
    haversineMeters(s, point) < haversineMeters(best, point) ? s : best
  );
}

/**
 * Precomputed map: routeId → stops that lie within 150m of that route's polyline.
 * Computed once at module import so we pay the cost upfront.
 */
const ROUTE_STOPS: Map<number, UniqueStop[]> = new Map(
  BUS_ROUTES.map((route) => [
    route.id,
    BUS_STOPS.filter((s) =>
      isNearRoute(
        { latitude: s.latitude, longitude: s.longitude },
        route.segments,
        150
      )
    ),
  ])
);

export type RouteOption = {
  id: string;
  type: 'direct' | 'transfer';
  /** The route(s) involved — 1 for direct, 2 for single transfer */
  routes: BusRoute[];
  /** Stop nearest to origin where the user boards the first route */
  boardStop: UniqueStop;
  /** Stop where user switches routes (transfer only) */
  transferStop?: UniqueStop;
  /** Stop nearest to destination where user exits the last route */
  alightStop: UniqueStop;
  /** Walking distance in meters from origin to board stop */
  walkToBoard: number;
  /** Walking distance in meters from alight stop to destination */
  walkFromAlight: number;
  /** Seconds until next bus on the first route (if live data available) */
  nextBusSeconds?: number;
};

/**
 * Given an origin and destination, returns the top 2-3 transit options ranked
 * by walking distance to the board stop. Filters to currently-active routes
 * when activeRouteData is provided. Direct routes are always preferred over
 * transfers; transfers are only included when fewer than 2 directs exist.
 */
export function findRouteOptions(
  origin: GeoPoint,
  destination: GeoPoint,
  activeRouteData?: ActiveRouteData
): RouteOption[] {
  const STOP_RADIUS = 500; // meters — how far a user walks to a stop

  // Filter to only routes that are currently running (if data available)
  const activeRoutes = activeRouteData
    ? BUS_ROUTES.filter((r) => activeRouteData.activeRouteIds.has(r.id))
    : BUS_ROUTES;

  const originNearby = stopsNearPoint(origin, STOP_RADIUS);
  const destNearby = stopsNearPoint(destination, STOP_RADIUS);

  if (originNearby.length === 0 || destNearby.length === 0) return [];

  const options: RouteOption[] = [];
  const seen = new Set<string>();

  // ── Direct routes ──────────────────────────────────────────────────────────
  for (const route of activeRoutes) {
    const rs = ROUTE_STOPS.get(route.id) ?? [];
    const rsIds = new Set(rs.map((s) => s.id));

    const boardable = originNearby.filter((s) => rsIds.has(s.id));
    const alightable = destNearby.filter((s) => rsIds.has(s.id));
    if (boardable.length === 0 || alightable.length === 0) continue;

    const optId = `direct-${route.id}`;
    if (seen.has(optId)) continue;
    seen.add(optId);

    const board = closestStop(boardable, origin);
    const alight = closestStop(alightable, destination);
    options.push({
      id: optId,
      type: 'direct',
      routes: [route],
      boardStop: board,
      alightStop: alight,
      walkToBoard: haversineMeters(board, origin),
      walkFromAlight: haversineMeters(alight, destination),
    });
  }

  // ── Single-transfer routes ─────────────────────────────────────────────────
  // Only search for transfers when we have fewer than 2 direct options
  if (options.length < 2) {
    const boardingRoutes = activeRoutes.filter((r) => {
      const rs = ROUTE_STOPS.get(r.id) ?? [];
      const rsIds = new Set(rs.map((s) => s.id));
      return originNearby.some((s) => rsIds.has(s.id));
    });

    const alightingRoutes = activeRoutes.filter((r) => {
      const rs = ROUTE_STOPS.get(r.id) ?? [];
      const rsIds = new Set(rs.map((s) => s.id));
      return destNearby.some((s) => rsIds.has(s.id));
    });

    for (const r1 of boardingRoutes) {
      for (const r2 of alightingRoutes) {
        if (r1.id === r2.id) continue;
        const optId = `transfer-${r1.id}-${r2.id}`;
        if (seen.has(optId)) continue;

        const r1Stops = ROUTE_STOPS.get(r1.id) ?? [];
        const r2Stops = ROUTE_STOPS.get(r2.id) ?? [];
        const r2Ids = new Set(r2Stops.map((s) => s.id));

        const transferCandidates = r1Stops.filter((s) => r2Ids.has(s.id));
        if (transferCandidates.length === 0) continue;

        const r1Ids = new Set(r1Stops.map((s) => s.id));
        const boardable = originNearby.filter((s) => r1Ids.has(s.id));
        const alightable = destNearby.filter((s) => r2Ids.has(s.id));
        if (boardable.length === 0 || alightable.length === 0) continue;

        const mid: GeoPoint = {
          latitude: (origin.latitude + destination.latitude) / 2,
          longitude: (origin.longitude + destination.longitude) / 2,
        };

        const board = closestStop(boardable, origin);
        const alight = closestStop(alightable, destination);
        seen.add(optId);
        options.push({
          id: optId,
          type: 'transfer',
          routes: [r1, r2],
          boardStop: board,
          transferStop: closestStop(transferCandidates, mid),
          alightStop: alight,
          walkToBoard: haversineMeters(board, origin),
          walkFromAlight: haversineMeters(alight, destination),
        });

        if (options.filter((o) => o.type === 'transfer').length >= 2) break;
      }
      if (options.filter((o) => o.type === 'transfer').length >= 2) break;
    }
  }

  // Attach next-bus seconds from live arrival data
  if (activeRouteData) {
    for (const opt of options) {
      const entry = activeRouteData.arrivals.get(opt.routes[0].id);
      if (entry && entry.times.length > 0) {
        opt.nextBusSeconds = entry.times[0].seconds;
      }
    }
  }

  // Sort: direct before transfer, then by walking distance to board stop
  options.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'direct' ? -1 : 1;
    return a.walkToBoard - b.walkToBoard;
  });

  // Cap: up to 3 total, prioritizing directs
  const directs = options.filter((o) => o.type === 'direct').slice(0, 3);
  const transfers = options.filter((o) => o.type === 'transfer').slice(0, 3 - directs.length);
  return [...directs, ...transfers].slice(0, 3);
}
