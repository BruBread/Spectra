'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Trash2 } from 'lucide-react';
import type { Zone } from '../../lib/vision/types';
import { Button } from '../ui/Button';
import styles from './ZoneDrawer.module.css';

interface ZoneDrawerProps {
  zone: Zone | null;
  backgroundImage: string | null;
  onChange: (zone: Zone | null) => void;
}

export function ZoneDrawer({ zone, backgroundImage, onChange }: ZoneDrawerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);
  const [draft, setDraft] = useState<Zone | null>(zone);

  const toRelative = (clientX: number, clientY: number): [number, number] => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0];
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return [x, y];
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    (event.target as Element).setPointerCapture(event.pointerId);
    const point = toRelative(event.clientX, event.clientY);
    setDragStart(point);
    setDraft({ x: point[0], y: point[1], width: 0, height: 0 });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const [x, y] = toRelative(event.clientX, event.clientY);
    setDraft({
      x: Math.min(dragStart[0], x),
      y: Math.min(dragStart[1], y),
      width: Math.abs(x - dragStart[0]),
      height: Math.abs(y - dragStart[1]),
    });
  };

  const handlePointerUp = () => {
    if (draft && draft.width > 0.02 && draft.height > 0.02) {
      onChange(draft);
    } else {
      setDraft(zone);
    }
    setDragStart(null);
  };

  const clear = () => {
    setDraft(null);
    onChange(null);
  };

  return (
    <div className={styles.wrapper}>
      <div
        ref={containerRef}
        className={styles.canvas}
        style={backgroundImage ? { backgroundImage: `url(${backgroundImage})` } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {!backgroundImage ? <div className={styles.placeholderGrid} aria-hidden="true" /> : null}
        {draft ? (
          <div
            className={styles.zoneBox}
            style={{
              left: `${draft.x * 100}%`,
              top: `${draft.y * 100}%`,
              width: `${draft.width * 100}%`,
              height: `${draft.height * 100}%`,
            }}
          />
        ) : null}
      </div>
      <div className={styles.actions}>
        <p className={styles.hint}>Click and drag to draw the zone. Leave empty to apply to the whole frame.</p>
        {draft ? (
          <Button size="sm" variant="ghost" onClick={clear}>
            <Trash2 size={14} aria-hidden="true" /> Clear zone
          </Button>
        ) : null}
      </div>
    </div>
  );
}
