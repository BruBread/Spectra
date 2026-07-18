'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileClock, Loader2, Lock, PlugZap, RefreshCw, SearchX } from 'lucide-react';
import { useCameraSources } from '../../context/CameraSourcesContext';
import { failed, loaded, loading, type LoadState } from '../../lib/accessControl/loadState';
import {
  ACTION_LABELS,
  DECISION_LABELS,
  RULE_LABELS,
  RULE_SOURCE_LABELS,
  SUBJECT_LABELS,
  UNIDENTIFIED_REASON_LABELS,
  type ActionKey,
  type PolicyDecision,
  type PolicyDecisionOutcome,
  type PolicyRuleSource,
  type PolicySubject,
} from '../../lib/accessControl/types';
import { fetchPolicyDecisions } from '../../lib/api/accessControl';
import { formatDateTime } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { DataTable, type Column } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { Select } from '../ui/Select';
import styles from './accessControl.module.css';

interface Filters {
  decision: PolicyDecisionOutcome | 'all';
  subject: PolicySubject | 'all';
  action: ActionKey | 'all';
  ruleSource: PolicyRuleSource | 'all';
  cameraId: string;
}

const EMPTY_FILTERS: Filters = { decision: 'all', subject: 'all', action: 'all', ruleSource: 'all', cameraId: 'all' };

const ACTION_KEYS: ActionKey[] = ['restricted_area', 'possible_weapon', 'unattended_object'];

export function DecisionLogPanel() {
  const { cameras } = useCameraSources();
  const [decisions, setDecisions] = useState<LoadState<PolicyDecision[]>>(loading([]));
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const filtersActive =
    filters.decision !== 'all' ||
    filters.subject !== 'all' ||
    filters.action !== 'all' ||
    filters.ruleSource !== 'all' ||
    filters.cameraId !== 'all';

  const load = useCallback(async () => {
    setDecisions(loading([]));
    const result = await fetchPolicyDecisions({
      decision: filters.decision === 'all' ? undefined : filters.decision,
      subject: filters.subject === 'all' ? undefined : filters.subject,
      action: filters.action === 'all' ? undefined : filters.action,
      ruleSource: filters.ruleSource === 'all' ? undefined : filters.ruleSource,
      cameraId: filters.cameraId === 'all' ? undefined : filters.cameraId,
    });
    setDecisions(result.ok && result.data ? loaded(result.data) : failed([], result.error ?? 'Could not load the decision log.'));
  }, [filters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching from the backend when the filter set changes; the loading flip is the point, not a derived value
    void load();
  }, [load]);

  const cameraLabel = (cameraId: string) => cameras.find((camera) => camera.id === cameraId)?.name ?? cameraId;

  const columns: Column<PolicyDecision>[] = [
    { key: 'time', header: 'When', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <div className={styles.cellStack}>
          <span>{ACTION_LABELS[row.action] ?? row.action}</span>
          <span className={styles.cellMuted}>{cameraLabel(row.cameraId)}</span>
        </div>
      ),
    },
    { key: 'zone', header: 'Zone', render: (row) => row.zoneName ?? <span className={styles.cellMuted}>—</span> },
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <div className={styles.cellStack}>
          <span>{SUBJECT_LABELS[row.subject]}</span>
          {row.subject === 'unidentified_person' && row.unidentifiedReason ? (
            <span className={styles.cellMuted}>{UNIDENTIFIED_REASON_LABELS[row.unidentifiedReason]}</span>
          ) : null}
          {row.personName ? (
            <span className={styles.cellMuted}>
              {row.personName}
              {row.roleKey ? ` · ${row.roleKey}` : ''}
            </span>
          ) : null}
          {row.aprilTagId !== null ? <span className={styles.mono}>Tag {row.aprilTagId}</span> : null}
        </div>
      ),
    },
    {
      key: 'rule',
      header: 'Rule',
      render: (row) => (
        <div className={styles.cellStack}>
          <Badge tone={row.ruleApplied === 'allow' ? 'warning' : 'neutral'}>{RULE_LABELS[row.ruleApplied]}</Badge>
          {/* "unidentified policy applied" vs "someone's role rule" vs "nobody
              wrote one" — the distinction the audit trail exists to record. */}
          <span className={styles.cellMuted}>{RULE_SOURCE_LABELS[row.ruleSource]}</span>
        </div>
      ),
    },
    {
      key: 'decision',
      header: 'Outcome',
      render: (row) => (
        <Badge tone={row.decision === 'suppressed' ? 'neutral' : 'warning'}>{DECISION_LABELS[row.decision]}</Badge>
      ),
    },
    { key: 'reason', header: 'Reason', render: (row) => <span className={styles.cellMuted}>{row.reason}</span> },
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.note}>
        <Lock size={16} aria-hidden="true" />
        <span>
          Read-only by design. A suppressed detection produces no alert, so its record here is the only evidence it
          happened — the API exposes no way to create, edit or delete one.
        </span>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <Select
            label="Outcome"
            className={styles.filterField}
            value={filters.decision}
            onChange={(event) => setFilters({ ...filters, decision: event.target.value as Filters['decision'] })}
          >
            <option value="all">All outcomes</option>
            <option value="alert_created">Alert created</option>
            <option value="suppressed">Suppressed</option>
          </Select>
          <Select
            label="Subject"
            className={styles.filterField}
            value={filters.subject}
            onChange={(event) => setFilters({ ...filters, subject: event.target.value as Filters['subject'] })}
          >
            <option value="all">All subjects</option>
            <option value="person">Identified person</option>
            <option value="unidentified_person">Unidentified</option>
          </Select>
          <Select
            label="Action"
            className={styles.filterField}
            value={filters.action}
            onChange={(event) => setFilters({ ...filters, action: event.target.value as Filters['action'] })}
          >
            <option value="all">All actions</option>
            {ACTION_KEYS.map((action) => (
              <option key={action} value={action}>
                {ACTION_LABELS[action]}
              </option>
            ))}
          </Select>
          <Select
            label="Rule source"
            className={styles.filterField}
            value={filters.ruleSource}
            onChange={(event) => setFilters({ ...filters, ruleSource: event.target.value as Filters['ruleSource'] })}
          >
            <option value="all">All sources</option>
            <option value="role">Role rule</option>
            <option value="unidentified_policy">Unidentified policy</option>
            <option value="default">Default (restrict)</option>
          </Select>
          <Select
            label="Camera"
            className={styles.filterField}
            value={filters.cameraId}
            onChange={(event) => setFilters({ ...filters, cameraId: event.target.value })}
          >
            <option value="all">All cameras</option>
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.name}
              </option>
            ))}
          </Select>
        </div>

        <div className={styles.toolbarActions}>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={decisions.status === 'loading'}>
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </Button>
        </div>
      </div>

      <Card padding="sm">
        {decisions.status === 'loading' ? (
          <EmptyState icon={<Loader2 size={20} className={styles.spin} aria-hidden="true" />} title="Loading decisions…" />
        ) : decisions.status === 'error' ? (
          <EmptyState
            icon={<PlugZap size={20} aria-hidden="true" />}
            title="Could not load the decision log"
            description={decisions.error ?? undefined}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        ) : decisions.data.length === 0 && filtersActive ? (
          <EmptyState
            icon={<SearchX size={20} aria-hidden="true" />}
            title="No decisions match these filters"
            action={
              <Button variant="secondary" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear filters
              </Button>
            }
          />
        ) : decisions.data.length === 0 ? (
          <EmptyState
            icon={<FileClock size={20} aria-hidden="true" />}
            title="No policy decisions recorded"
            description="Nothing writes to this log yet: the policy engine that evaluates detections against roles and zones has not been built. It stays empty until then — no decision here is ever simulated."
          />
        ) : (
          <DataTable columns={columns} rows={decisions.data} getRowId={(row) => row.id} />
        )}
      </Card>
    </div>
  );
}
