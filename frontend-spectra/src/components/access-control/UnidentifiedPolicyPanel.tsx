'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, PlugZap, ShieldAlert, UserX } from 'lucide-react';
import { useCameraSources } from '../../context/CameraSourcesContext';
import { useToast } from '../../context/ToastContext';
import { failed, loaded, loading, type LoadState } from '../../lib/accessControl/loadState';
import type { ActionDefinition, ActionRule, RestrictedZone, UnidentifiedPolicy } from '../../lib/accessControl/types';
import { fetchUnidentifiedPolicy, updateUnidentifiedPolicy } from '../../lib/api/accessControl';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ActionRulesEditor } from './ActionRulesEditor';
import styles from './accessControl.module.css';

interface UnidentifiedPolicyPanelProps {
  zones: LoadState<RestrictedZone[]>;
  catalog: LoadState<ActionDefinition[]>;
  canEdit: boolean;
}

export function UnidentifiedPolicyPanel({ zones, catalog, canEdit }: UnidentifiedPolicyPanelProps) {
  const { showToast } = useToast();
  const { cameras } = useCameraSources();
  const [policy, setPolicy] = useState<LoadState<UnidentifiedPolicy>>(loading({ subject: 'unidentified_person', defaultRule: 'restrict', rules: [], updatedAt: null }));
  const [busy, setBusy] = useState(false);

  const cameraName = (cameraId: string) => cameras.find((camera) => camera.id === cameraId)?.name ?? 'Unregistered camera';

  const load = useCallback(async () => {
    const result = await fetchUnidentifiedPolicy();
    setPolicy(
      result.ok && result.data
        ? loaded(result.data)
        : failed({ subject: 'unidentified_person', defaultRule: 'restrict', rules: [], updatedAt: null }, result.error ?? 'Could not load the policy.'),
    );
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching the policy from the backend on mount
    void load();
  }, [load]);

  const handleChange = async (nextRules: ActionRule[]) => {
    setBusy(true);
    const result = await updateUnidentifiedPolicy(nextRules);
    setBusy(false);

    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Could not update the policy.', 'error');
      return;
    }
    setPolicy(loaded(result.data));
  };

  return (
    <div className={styles.panel}>
      <div className={styles.caution}>
        <ShieldAlert size={16} aria-hidden="true" />
        <span>
          This policy covers <strong>everyone the cameras cannot identify</strong> — anyone without a readable,
          registered AprilTag, including when a LoRa device is nearby. Everything restricts by default. Setting a zone to
          Allow waves through <strong>every</strong> unidentified person there, so it asks for confirmation. It is
          configuration only and nothing enforces it yet.
        </span>
      </div>

      {policy.status === 'loading' || catalog.status === 'loading' ? (
        <Card padding="sm">
          <EmptyState icon={<Loader2 size={20} className={styles.spin} aria-hidden="true" />} title="Loading policy…" />
        </Card>
      ) : policy.status === 'error' ? (
        <Card padding="sm">
          <EmptyState
            icon={<PlugZap size={20} aria-hidden="true" />}
            title="Could not load the policy"
            description={policy.error ?? undefined}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : catalog.status === 'error' ? (
        <Card padding="sm">
          <EmptyState
            icon={<PlugZap size={20} aria-hidden="true" />}
            title="Could not load the action catalog"
            description={catalog.error ?? undefined}
          />
        </Card>
      ) : (
        <Card>
          <div className={styles.cardTitleRow}>
            <UserX size={16} aria-hidden="true" />
            <span className={styles.cardTitle}>Unidentified / No Credential</span>
          </div>
          <div className={styles.permissions}>
            <ActionRulesEditor
              catalog={catalog.data}
              zones={zones}
              rules={policy.data.rules}
              canEdit={canEdit}
              busy={busy}
              confirmOnAllow
              cameraName={cameraName}
              onChange={(nextRules) => void handleChange(nextRules)}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
