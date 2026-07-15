import type { Camera, CameraStatus } from '../types';
import { createRng, pick, weightedPick } from './rng';
import { MOCK_ANCHOR } from './constants';

const LOCATIONS: Array<{ name: string; location: string; zone: string }> = [
  { name: 'Main Entrance', location: 'North Gate', zone: 'Zone A' },
  { name: 'Parking Area', location: 'Lot B, Level 1', zone: 'Zone B' },
  { name: 'Lobby', location: 'Admin Building', zone: 'Zone A' },
  { name: 'Corridor A', location: 'Science Wing, 2nd Floor', zone: 'Zone C' },
  { name: 'Back Entrance', location: 'Service Road', zone: 'Zone B' },
  { name: 'Storage Room', location: 'Facilities Basement', zone: 'Zone D' },
  { name: 'Library Wing', location: 'East Building', zone: 'Zone C' },
  { name: 'Cafeteria', location: 'Student Center', zone: 'Zone A' },
  { name: 'Gymnasium', location: 'South Complex', zone: 'Zone D' },
  { name: 'Loading Dock', location: 'Service Road', zone: 'Zone B' },
];

const STATUS_WEIGHTS: Array<[CameraStatus, number]> = [
  ['live', 6],
  ['offline', 2],
  ['idle', 1],
];

const RELATIVE_ACTIVITY = [
  '2 mins ago',
  '10 mins ago',
  '24 mins ago',
  '1 hour ago',
  '3 hours ago',
  '6 hours ago',
  'Yesterday, 9:40 PM',
  '2 days ago',
];

export function generateCameras(seed = 7, count = 8): Camera[] {
  const rng = createRng(seed);

  return Array.from({ length: count }, (_, index) => {
    const spot = LOCATIONS[index % LOCATIONS.length];
    const status = weightedPick(rng, STATUS_WEIGHTS);
    const addedDaysAgo = intRange(rng, 5, 240);

    return {
      id: `CAM-${String(index + 1).padStart(2, '0')}`,
      name: spot.name,
      location: spot.location,
      zone: spot.zone,
      status,
      lastActivity: status === 'offline' ? pick(rng, RELATIVE_ACTIVITY.slice(4)) : pick(rng, RELATIVE_ACTIVITY),
      addedAt: new Date(MOCK_ANCHOR - addedDaysAgo * 86_400_000).toISOString(),
      paletteIndex: index % 6,
    };
  });
}

function intRange(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}
