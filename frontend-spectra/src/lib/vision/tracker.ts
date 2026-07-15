export interface TrackedEntity<TMeta> {
  trackId: string;
  centroid: [number, number];
  box: [number, number, number, number];
  meta: TMeta;
  firstSeenAt: number;
  lastSeenAt: number;
}

interface TrackerOptions {
  /** Max pixel distance between frames to consider it the same entity. */
  maxMatchDistance: number;
  /** How long to keep a track alive through brief detection gaps (occlusion, missed frame). */
  maxMissedMs: number;
}

function boxCentroid([x, y, w, h]: [number, number, number, number]): [number, number] {
  return [x + w / 2, y + h / 2];
}

function distance([ax, ay]: [number, number], [bx, by]: [number, number]): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Greedy nearest-centroid tracker: assigns a persistent id to bounding-box
 * detections across frames so duration-based detectors (e.g. "has this bag
 * been stationary for 30s") have something stable to key off of. COCO-SSD
 * has no built-in tracking, unlike MoveNet's multi-pose tracker, so this
 * exists specifically for object-class detections (bags, etc).
 */
export class CentroidTracker<TMeta> {
  private tracks = new Map<string, TrackedEntity<TMeta>>();
  private nextId = 1;

  constructor(private options: TrackerOptions) {}

  update(detections: Array<{ box: [number, number, number, number]; meta: TMeta }>, now: number): TrackedEntity<TMeta>[] {
    const unmatched = new Set(this.tracks.keys());
    const results: TrackedEntity<TMeta>[] = [];

    for (const detection of detections) {
      const centroid = boxCentroid(detection.box);
      let bestId: string | null = null;
      let bestDist = Infinity;

      for (const id of unmatched) {
        const track = this.tracks.get(id);
        if (!track) continue;
        const dist = distance(track.centroid, centroid);
        if (dist < bestDist && dist <= this.options.maxMatchDistance) {
          bestDist = dist;
          bestId = id;
        }
      }

      if (bestId) {
        unmatched.delete(bestId);
        const track = this.tracks.get(bestId);
        if (track) {
          track.centroid = centroid;
          track.box = detection.box;
          track.meta = detection.meta;
          track.lastSeenAt = now;
          results.push(track);
        }
      } else {
        const id = `t${this.nextId++}`;
        const track: TrackedEntity<TMeta> = {
          trackId: id,
          centroid,
          box: detection.box,
          meta: detection.meta,
          firstSeenAt: now,
          lastSeenAt: now,
        };
        this.tracks.set(id, track);
        results.push(track);
      }
    }

    for (const id of unmatched) {
      const track = this.tracks.get(id);
      if (track && now - track.lastSeenAt > this.options.maxMissedMs) {
        this.tracks.delete(id);
      }
    }

    return results;
  }
}
