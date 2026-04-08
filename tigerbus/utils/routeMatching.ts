import { BusRoute } from '../app/busRouteData';

export type GeoPoint = { latitude: number; longitude: number };

/** Haversine distance between two points in meters */
export function haversineMeters(p1: GeoPoint, p2: GeoPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(p2.latitude - p1.latitude);
  const dLon = toRad(p2.longitude - p1.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.latitude)) *
      Math.cos(toRad(p2.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true if `point` is within `thresholdMeters` of any vertex
 * in any segment of the route.
 */
export function isNearRoute(
  point: GeoPoint,
  segments: GeoPoint[][],
  thresholdMeters = 600
): boolean {
  for (const segment of segments) {
    for (const routePoint of segment) {
      if (haversineMeters(point, routePoint) <= thresholdMeters) {
        return true;
      }
    }
  }
  return false;
}

/**
 * A route "serves" a trip when it passes near BOTH origin and destination.
 */
export function routeServesTrip(
  route: BusRoute,
  origin: GeoPoint,
  destination: GeoPoint,
  thresholdMeters = 600
): boolean {
  return (
    isNearRoute(origin, route.segments, thresholdMeters) &&
    isNearRoute(destination, route.segments, thresholdMeters)
  );
}
