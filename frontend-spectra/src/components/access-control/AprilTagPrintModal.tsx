'use client';

import { createPortal } from 'react-dom';
import { AlertTriangle, Printer } from 'lucide-react';
import type { Person } from '../../lib/accessControl/types';
import { APRILTAG_FAMILY, buildAprilTagSvg } from '../../lib/accessControl/aprilTag';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import styles from './AprilTagPrintModal.module.css';

interface AprilTagPrintModalProps {
  person: Person;
  onClose: () => void;
}

/**
 * Preview and print the physical AprilTag a person already carries.
 *
 * The on-screen dialog is a normal preview; pressing Print hands off to the
 * browser. A separate, screen-hidden print sheet (portaled to <body>) is what
 * actually reaches paper — the global print stylesheet hides the app chrome and
 * shows only that sheet, one tag per page, centred. Text sits above and below
 * the marker, never over it, and the generator's white quiet border is left
 * untouched.
 */
export function AprilTagPrintModal({ person, onClose }: AprilTagPrintModalProps) {
  const result = buildAprilTagSvg(person.aprilTagId);

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Print AprilTag"
        description={`The exact 36h11 tag Spectra's camera recognises for ${person.name}.`}
        size="md"
        footer={
          <div className={styles.footerRow}>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => window.print()} disabled={!result.ok}>
              <Printer size={14} aria-hidden="true" /> Print
            </Button>
          </div>
        }
      >
        {result.ok ? (
          <div className={styles.previewLayout} data-testid="apriltag-preview">
            {/* The generated marker, shown as-is. Nothing is drawn over the pattern. */}
            <div
              className={styles.tagFrame}
              aria-label={`AprilTag 36h11, ID ${result.tagId}`}
              dangerouslySetInnerHTML={{ __html: result.svg }}
            />
            <dl className={styles.meta}>
              <div>
                <dt>Person</dt>
                <dd>{person.name}</dd>
              </div>
              <div>
                <dt>Family</dt>
                <dd>{APRILTAG_FAMILY}</dd>
              </div>
              <div>
                <dt>Tag ID</dt>
                <dd data-testid="apriltag-id" className={styles.mono}>
                  {result.tagId}
                </dd>
              </div>
            </dl>

            <div className={styles.guidance}>
              <p className={styles.guidanceTitle}>Before printing</p>
              <ul>
                <li>Print at high contrast — pure black on white, no scaling to “fit”.</li>
                <li>Do not crop the white border around the tag; the camera needs that quiet zone.</li>
                <li>Start with a tag at least 8–10&nbsp;cm wide for the camera demo.</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className={styles.error} role="alert" data-testid="apriltag-error">
            <AlertTriangle size={18} aria-hidden="true" />
            <p>{result.error}</p>
          </div>
        )}
      </Modal>

      {/* Print-only sheet. Hidden on screen; the print stylesheet reveals just this. */}
      {result.ok && typeof document !== 'undefined'
        ? createPortal(
            <div className="aprilTagPrintSheet" data-testid="apriltag-print-sheet" aria-hidden="true">
              <p className="aprilTagPrintName">{person.name}</p>
              <div className="aprilTagPrintTag" dangerouslySetInnerHTML={{ __html: result.svg }} />
              <p className="aprilTagPrintCaption">
                {APRILTAG_FAMILY} · ID {result.tagId}
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
