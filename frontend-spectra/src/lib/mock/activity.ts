import { createRng, intBetween } from './rng';

export interface ActivityPoint {
  label: string;
  value: number;
}

export function generateWeeklyActivity(seed = 3): ActivityPoint[] {
  const rng = createRng(seed);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let value = intBetween(rng, 30, 55);

  return days.map((label) => {
    value = Math.max(8, Math.min(100, value + intBetween(rng, -18, 22)));
    return { label, value };
  });
}
