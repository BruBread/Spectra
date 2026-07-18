import { CentroidTracker } from './tracker';
import type { DetectedObjectBox } from './models/objectModel';
import type { DetectedAprilTag } from './models/aprilTagModel';
import { defaultRestrictedAreaSettings, type RestrictedAreaSettings } from './types';

/** A restricted zone as the observer needs it: an id, a name, and a 0–1 rectangle. */
export interface ObserverZone {
  id: string;
  name: string;
  rect: { x: number; y: number; width: number; height: number };
}

export interface ObserverFrameInput {
  now: number;
  videoWidth: number;
  videoHeight: number;
  objects: DetectedObjectBox[];
  aprilTags: DetectedAprilTag[];
  /** Multiply AprilTag corner coords by this to reach video pixels. */
  aprilTagScale: number;
}

/**
 * A confirmed entry, ready to post once the pipeline attaches a snapshot.
 *
 * Everything here is a CV fact. There is deliberately no identity, role or
 * rule: the observer decodes tags to numbers and measures geometry, and the
 * server decides who the person is and whether they may be there. `box` is
 * carried only so the pipeline can crop the evidence snapshot.
 */
export interface ObservationCandidate {
  zoneId: string;
  trackId: string;
  frame: { width: number; height: number };
  personBox: [number, number, number, number];
  enteredFromOutside: boolean;
  framesInside: number;
  dwellMs: number;
  aprilTags: number[];
  box: [number, number, number, number];
}

/** Only reasonably confident person boxes are tracked. */
const PERSON_SCORE_THRESHOLD = 0.5;
/** Max centroid travel between frames to be judged the same person. */
const TRACK_MATCH_DISTANCE = 120;
/** Keep a track alive through this many ms of missed detections (brief occlusion). */
const TRACK_MAX_MISSED_MS = 1500;

/** Bottom-centre of a person box — the ground point. */
function groundPoint(box: [number, number, number, number]): [number, number] {
  const [x, y, w, h] = box;
  return [x + w / 2, y + h];
}

function pointInRect(px: number, py: number, rect: ObserverZone['rect'], w: number, h: number): boolean {
  const nx = px / w;
  const ny = py / h;
  return nx >= rect.x && nx <= rect.x + rect.width && ny >= rect.y && ny <= rect.y + rect.height;
}

/** Centre of a decoded tag in video pixels, for matching it to a person box. */
function tagCentre(tag: DetectedAprilTag, scale: number): [number, number] {
  const xs = tag.corners.map((corner) => corner.x);
  const ys = tag.corners.map((corner) => corner.y);
  const cx = (xs.reduce((a, b) => a + b, 0) / xs.length) * scale;
  const cy = (ys.reduce((a, b) => a + b, 0) / ys.length) * scale;
  return [cx, cy];
}

function boxContains(box: [number, number, number, number], px: number, py: number): boolean {
  const [x, y, w, h] = box;
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

/** Per-zone entry state for one tracked person. */
interface ZoneTrackState {
  /** Have we ever seen this track with its ground point OUTSIDE this zone? */
  seenOutside: boolean;
  framesInside: number;
  insideSince: number | null;
  /** Last time we posted for this (track, zone) — client-side cooldown. */
  lastPostedAt: number | null;
}

/**
 * Watches tracked people crossing into restricted zones and produces the
 * observations the server evaluates.
 *
 * This is CV and bookkeeping only. The one policy-adjacent thing it must never
 * do is decide who a person is or whether they belong: it emits tag *numbers*
 * and geometry, and stops there. The backend re-derives every quality gate
 * from what is posted, so the client checks here are to avoid pointless posts,
 * not a source of truth.
 */
export class RestrictedAreaObserver {
  private tracker = new CentroidTracker<Record<string, never>>({
    maxMatchDistance: TRACK_MATCH_DISTANCE,
    maxMissedMs: TRACK_MAX_MISSED_MS,
  });
  /** trackId → zoneId → state. */
  private state = new Map<string, Map<string, ZoneTrackState>>();
  private settings: RestrictedAreaSettings;

  constructor(settings?: RestrictedAreaSettings) {
    this.settings = settings ?? defaultRestrictedAreaSettings();
  }

  updateSettings(settings: RestrictedAreaSettings): void {
    this.settings = settings;
  }

  reset(): void {
    this.tracker = new CentroidTracker({ maxMatchDistance: TRACK_MATCH_DISTANCE, maxMissedMs: TRACK_MAX_MISSED_MS });
    this.state.clear();
  }

  /** Passes the same geometry gates the backend enforces — used to skip pointless posts. */
  private passesGeometry(box: [number, number, number, number], w: number, h: number): boolean {
    const s = this.settings;
    const [bx, by, bw, bh] = box;
    const edgeW = s.edgeEpsilonFraction * w;
    const edgeH = s.edgeEpsilonFraction * h;
    if (bx <= edgeW || bx + bw >= w - edgeW || by + bh >= h - edgeH) return false; // clipped feet/sides

    const heightFraction = bh / h;
    const areaFraction = (bw * bh) / (w * h);
    if (heightFraction < s.minHeightFraction || areaFraction < s.minAreaFraction) return false;
    if (heightFraction > s.maxHeightFraction || areaFraction > s.maxAreaFraction) return false;
    return true;
  }

  observe(input: ObserverFrameInput, zones: ObserverZone[]): ObservationCandidate[] {
    if (zones.length === 0) {
      // Nothing to enforce; keep the tracker warm-free so a re-enabled zone
      // doesn't inherit stale "was inside at startup" history.
      this.reset();
      return [];
    }

    const { now, videoWidth: w, videoHeight: h } = input;
    const persons = input.objects
      .filter((object) => object.objectClass === 'person' && object.score >= PERSON_SCORE_THRESHOLD)
      .map((object) => ({ box: object.bbox, meta: {} as Record<string, never> }));

    const tracks = this.tracker.update(persons, now);
    const liveTrackIds = new Set(tracks.map((track) => track.trackId));
    for (const id of [...this.state.keys()]) {
      if (!liveTrackIds.has(id)) this.state.delete(id);
    }

    const candidates: ObservationCandidate[] = [];

    for (const track of tracks) {
      const box = track.box;
      const [gx, gy] = groundPoint(box);
      const geometryOk = this.passesGeometry(box, w, h);

      let zoneStates = this.state.get(track.trackId);
      if (!zoneStates) {
        zoneStates = new Map();
        this.state.set(track.trackId, zoneStates);
      }

      for (const zone of zones) {
        let zs = zoneStates.get(zone.id);
        if (!zs) {
          zs = { seenOutside: false, framesInside: 0, insideSince: null, lastPostedAt: null };
          zoneStates.set(zone.id, zs);
        }

        const inRect = pointInRect(gx, gy, zone.rect, w, h);

        if (!inRect) {
          // Genuinely outside this zone: this is what makes a later entry a
          // real crossing rather than "was already standing there".
          zs.seenOutside = true;
          zs.framesInside = 0;
          zs.insideSince = null;
          continue;
        }

        if (!geometryOk) {
          // Ground point is in the zone but the box is clipped or the wrong
          // size — unusable. Don't count it as an entry, and don't let it mark
          // the track as "outside" either; we simply can't tell this frame.
          continue;
        }

        if (!zs.seenOutside) {
          // Inside since first sighting — not an entry. Never fires until the
          // track leaves and comes back.
          continue;
        }

        zs.framesInside += 1;
        if (zs.insideSince === null) zs.insideSince = now;
        const dwellMs = now - zs.insideSince;

        const confirmed = zs.framesInside >= this.settings.minFrames && dwellMs >= this.settings.minDwellMs;
        const cooledDown =
          zs.lastPostedAt === null || now - zs.lastPostedAt >= this.settings.cooldownSeconds * 1000;
        if (!confirmed || !cooledDown) continue;

        zs.lastPostedAt = now;
        const aprilTags = input.aprilTags
          .filter((tag) => {
            const [tx, ty] = tagCentre(tag, input.aprilTagScale);
            return boxContains(box, tx, ty);
          })
          .map((tag) => tag.tagId);

        candidates.push({
          zoneId: zone.id,
          trackId: track.trackId,
          frame: { width: w, height: h },
          personBox: box,
          enteredFromOutside: true,
          framesInside: zs.framesInside,
          dwellMs,
          aprilTags,
          box,
        });
      }
    }

    return candidates;
  }
}
