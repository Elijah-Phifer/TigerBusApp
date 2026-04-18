export type RouteWindow = {
  startHour: number;
  endHour: number; // if endHour < startHour, route runs past midnight
};

export type RouteSchedule = {
  routeId: number;
  windows: RouteWindow[];
  label: string;
};

function fmt(h: number): string {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

function sched(routeId: number, start: number, end: number): RouteSchedule {
  return {
    routeId,
    windows: [{ startHour: start, endHour: end }],
    label: `${fmt(start)} – ${fmt(end)}`,
  };
}

export const ROUTE_SCHEDULES: RouteSchedule[] = [
  sched(1,  7, 19),  // North Campus
  sched(2,  7, 19),  // Burbank-Ben Hur
  sched(3,  7, 19),  // Nicholson-Ben Hur
  sched(4,  7, 19),  // Garden District
  sched(5,  7, 19),  // Gold
  sched(6,  7, 19),  // Purple
  sched(7,  7, 19),  // Nicholson River Road A
  sched(8,  7, 19),  // Nicholson River Road B
  sched(9,  7, 19),  // Highland-Burbank
  sched(10, 7, 18),  // Park & Geaux - Union
  sched(11, 7, 19),  // Tigerland A
  sched(12, 7, 19),  // Tigerland B
  sched(13, 10, 17), // Sunday Shuttle
  sched(14, 7, 19),  // Geaux Gold
  sched(15, 18, 2),  // Night Campus Circulator
  sched(16, 18, 2),  // Night A
  sched(17, 18, 2),  // Night D
  sched(18, 21, 3),  // Tigerland Express West
  sched(19, 21, 3),  // Tigerland Express East
  sched(21, 7, 18),  // Charter
  sched(22, 7, 18),  // Park & Geaux
  sched(23, 7, 18),  // Park & Geaux - Lockett
];

export function routeRunsAtHour(routeId: number, hour: number): boolean {
  const schedule = ROUTE_SCHEDULES.find((s) => s.routeId === routeId);
  if (!schedule) return true;
  for (const w of schedule.windows) {
    if (w.startHour <= w.endHour) {
      if (hour >= w.startHour && hour < w.endHour) return true;
    } else {
      if (hour >= w.startHour || hour < w.endHour) return true;
    }
  }
  return false;
}

export function getScheduleLabel(routeId: number): string {
  return ROUTE_SCHEDULES.find((s) => s.routeId === routeId)?.label ?? '';
}

export function formatFilterHour(h: number): string {
  return fmt(h);
}

export const FILTER_PRESETS: { label: string; hour: number | null }[] = [
  { label: 'Now',        hour: null }, // null = resolve to current hour at press time
  { label: 'Morning',    hour: 8 },
  { label: 'Afternoon',  hour: 13 },
  { label: 'Evening',    hour: 18 },
  { label: 'Late Night', hour: 23 },
];
