'use client';

import { useState } from 'react';
import { CircleSlash, Lock } from 'lucide-react';
import type { LoadState } from '../../lib/accessControl/loadState';
import type { ActionDefinition, ActionKey, ActionRule, RestrictedZone } from '../../lib/accessControl/types';
import { cn } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { ConfirmAllowModal } from './ConfirmAllowModal';
import styles from './accessControl.module.css';

interface ActionRulesEditorProps {
  /** The code-defined catalog, rendered in full. */
  catalog: ActionDefinition[];
  zones: LoadState<RestrictedZone[]>;
  /** The subject's full rule set (a role's, or the unidentified policy's). */
  rules: ActionRule[];
  canEdit: boolean;
  busy: boolean;
  /** Emits the complete new rule set; the parent persists it. */
  onChange: (rules: ActionRule[]) => void;
  /**
   * When true, switching a target to Allow asks for confirmation first — used
   * where an allow applies to everyone the cameras cannot identify.
   */
  confirmOnAllow?: boolean;
  cameraName: (cameraId: string) => string;
}

const sameZone = (a: string | null, b: string | null) => (a ?? null) === (b ?? null);

export function ActionRulesEditor({
  catalog,
  zones,
  rules,
  canEdit,
  busy,
  onChange,
  confirmOnAllow = false,
  cameraName,
}: ActionRulesEditorProps) {
  const [pending, setPending] = useState<{ action: ActionKey; zoneId: string | null; scopeLabel: string } | null>(null);

  const ruleFor = (action: ActionKey, zoneId: string | null): 'allow' | 'restrict' =>
    rules.some((rule) => rule.action === action && sameZone(rule.zoneId, zoneId) && rule.rule === 'allow')
      ? 'allow'
      : 'restrict';

  const apply = (action: ActionKey, zoneId: string | null, next: 'allow' | 'restrict') => {
    // Only Allow rules are stored; Restrict leaves the target unwritten. Both
    // deny, and this control cannot express the difference between "denied" and
    // "considered and denied" — so it never fabricates the latter.
    const kept = rules.filter((rule) => !(rule.action === action && sameZone(rule.zoneId, zoneId)));
    onChange(next === 'allow' ? [...kept, { action, zoneId, rule: 'allow' }] : kept);
  };

  const requestAllow = (action: ActionKey, zoneId: string | null, scopeLabel: string) => {
    if (confirmOnAllow) {
      setPending({ action, zoneId, scopeLabel });
      return;
    }
    apply(action, zoneId, 'allow');
  };

  const renderToggle = (action: ActionKey, zoneId: string | null, scopeLabel: string) => {
    const value = ruleFor(action, zoneId);
    const disabled = !canEdit || busy;
    return (
      <div className={styles.segmented} role="group" aria-label={`${scopeLabel} rule`}>
        <button
          type="button"
          className={cn(styles.segment, value === 'allow' && styles.segmentAllow)}
          aria-pressed={value === 'allow'}
          disabled={disabled}
          onClick={() => (value === 'allow' ? undefined : requestAllow(action, zoneId, scopeLabel))}
        >
          Allow
        </button>
        <button
          type="button"
          className={cn(styles.segment, value === 'restrict' && styles.segmentRestrict)}
          aria-pressed={value === 'restrict'}
          disabled={disabled}
          onClick={() => apply(action, zoneId, 'restrict')}
        >
          Restrict
        </button>
      </div>
    );
  };

  return (
    <div className={styles.actionList}>
      {catalog.map((action) => (
        <section key={action.key} className={styles.actionSection} data-action={action.key}>
          <div className={styles.actionHeader}>
            <div>
              <div className={styles.actionTitleRow}>
                <span className={styles.actionTitle}>{action.label}</span>
                {action.detector === 'planned' ? <Badge tone="neutral">Not active yet</Badge> : null}
                {!action.policyEnforced ? <Badge tone="warning">Not enforced yet</Badge> : null}
              </div>
              <p className={styles.actionDescription}>{action.description}</p>
            </div>
          </div>

          {action.configurable ? (
            action.scope === 'zone' ? (
              <ZoneRules
                zones={zones}
                rules={rules}
                action={action.key}
                cameraName={cameraName}
                renderToggle={renderToggle}
              />
            ) : (
              // Global configurable action — none ship today, but the editor
              // stays catalog-driven rather than hard-coding restricted_area.
              renderToggle(action.key, null, action.label)
            )
          ) : (
            <div className={styles.actionReadonly}>
              <Lock size={14} aria-hidden="true" />
              <span>{action.unconfigurableReason}</span>
              {/* A rule can exist for an unconfigurable action — e.g. a weapon
                  exemption carried across by the migration. Hiding it would be
                  worse than showing that it exists and does nothing yet. */}
              {ruleFor(action.key, null) === 'allow' ? <Badge tone="warning">allowed — not enforced</Badge> : null}
            </div>
          )}
        </section>
      ))}

      {pending ? (
        <ConfirmAllowModal
          scopeLabel={pending.scopeLabel}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            apply(pending.action, pending.zoneId, 'allow');
            setPending(null);
          }}
        />
      ) : null}
    </div>
  );
}

interface ZoneRulesProps {
  zones: LoadState<RestrictedZone[]>;
  rules: ActionRule[];
  action: ActionKey;
  cameraName: (cameraId: string) => string;
  renderToggle: (action: ActionKey, zoneId: string | null, scopeLabel: string) => React.ReactNode;
}

function ZoneRules({ zones, rules, action, cameraName, renderToggle }: ZoneRulesProps) {
  if (zones.status === 'loading') return <p className={styles.emptyPermission}>Loading zones…</p>;
  if (zones.status === 'error') {
    return (
      <p className={styles.emptyPermission}>Zones could not be loaded, so per-zone rules cannot be shown or changed.</p>
    );
  }

  // Active zones, plus any archived zone this subject still allows — hiding the
  // latter would present a rule that exists as though it didn't.
  const allowsZone = (zoneId: string) =>
    rules.some((rule) => rule.action === action && rule.zoneId === zoneId && rule.rule === 'allow');
  const shown = zones.data.filter((zone) => zone.active || allowsZone(zone.id));

  if (shown.length === 0) {
    return (
      <p className={styles.emptyPermission}>
        No restricted zones exist yet. Create one under Restricted Zones to write a rule here.
      </p>
    );
  }

  return (
    <div className={styles.ruleRows}>
      {shown.map((zone) => (
        <div key={zone.id} className={styles.ruleRow} data-zone-rule={zone.id}>
          <div className={styles.cellStack}>
            <span className={styles.ruleZoneName}>{zone.name}</span>
            <span className={styles.zoneCheckMeta}>
              {cameraName(zone.cameraId)}
              {zone.active ? '' : ' · archived'}
            </span>
          </div>
          {renderToggle(action, zone.id, zone.name)}
        </div>
      ))}
      <p className={styles.emptyPermission}>
        <CircleSlash size={12} aria-hidden="true" /> A zone left on Restrict is denied — absence is not permission.
      </p>
    </div>
  );
}
