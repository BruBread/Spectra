'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, FileClock, MapPin, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { failed, loaded, loading, type LoadState } from '../../../lib/accessControl/loadState';
import type { AccessRole, RestrictedZone } from '../../../lib/accessControl/types';
import { fetchRoles, fetchZones } from '../../../lib/api/accessControl';
import { DecisionLogPanel } from '../../../components/access-control/DecisionLogPanel';
import { PeoplePanel } from '../../../components/access-control/PeoplePanel';
import { RolesPanel } from '../../../components/access-control/RolesPanel';
import { ZonesPanel } from '../../../components/access-control/ZonesPanel';
import { Tabs, TabPanel, type TabItem } from '../../../components/ui/Tabs';
import styles from './access-control.module.css';

const TABS: TabItem[] = [
  { id: 'people', label: 'People', icon: <Users size={16} aria-hidden="true" /> },
  { id: 'roles', label: 'Roles', icon: <ShieldCheck size={16} aria-hidden="true" /> },
  { id: 'zones', label: 'Restricted Zones', icon: <MapPin size={16} aria-hidden="true" /> },
  { id: 'decisions', label: 'Decision Log', icon: <FileClock size={16} aria-hidden="true" /> },
];

function AccessControlPageInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedTab = searchParams.get('tab');
  const activeTab = TABS.some((tab) => tab.id === requestedTab) ? (requestedTab as string) : 'people';

  /**
   * Only an admin may mutate: every write route here is admin-only on the
   * backend, so showing the controls to an operator would offer actions that
   * can only end in a 403.
   */
  const canEdit = user?.role === 'admin';

  /**
   * Roles and zones are loaded here rather than per tab because they are
   * entangled: a role's permissions name zones, and deleting a zone rewrites
   * those permissions. Separate copies would let one tab show a state the
   * other has already invalidated.
   */
  const [roles, setRoles] = useState<LoadState<AccessRole[]>>(loading([]));
  const [zones, setZones] = useState<LoadState<RestrictedZone[]>>(loading([]));

  const loadRoles = useCallback(async () => {
    const result = await fetchRoles();
    setRoles(result.ok && result.data ? loaded(result.data) : failed([], result.error ?? 'Could not load roles.'));
  }, []);

  const loadZones = useCallback(async () => {
    const result = await fetchZones();
    setZones(result.ok && result.data ? loaded(result.data) : failed([], result.error ?? 'Could not load zones.'));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching from the backend on mount; the loading flip is the point, not a derived value
    void loadRoles();
    void loadZones();
  }, [loadRoles, loadZones]);

  const reloadAll = useCallback(() => {
    void loadRoles();
    void loadZones();
  }, [loadRoles, loadZones]);

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.title}>Access Control</h2>
          <p className={styles.subtitle}>
            People, roles, restricted zones and the policy decision log. Configuration only — no detector or policy
            engine reads any of it yet.
          </p>
        </div>
        {!canEdit ? (
          <p className={styles.readOnly}>
            <Eye size={14} aria-hidden="true" /> Read-only: changing access control requires an admin account.
          </p>
        ) : null}
      </div>

      <div className={styles.tabs}>
        <Tabs
          items={TABS}
          activeId={activeTab}
          orientation="horizontal"
          // The tab lives in the URL so a view can be linked to and survives a
          // reload.
          onChange={(id) => router.replace(`/access-control?tab=${id}`, { scroll: false })}
        />
      </div>

      <TabPanel id="people" activeId={activeTab}>
        <PeoplePanel roles={roles} canEdit={canEdit} onPeopleChanged={reloadAll} />
      </TabPanel>
      <TabPanel id="roles" activeId={activeTab}>
        <RolesPanel roles={roles} zones={zones} canEdit={canEdit} onRolesChanged={reloadAll} />
      </TabPanel>
      <TabPanel id="zones" activeId={activeTab}>
        <ZonesPanel zones={zones} roles={roles} canEdit={canEdit} onZonesChanged={reloadAll} />
      </TabPanel>
      <TabPanel id="decisions" activeId={activeTab}>
        <DecisionLogPanel />
      </TabPanel>
    </div>
  );
}

/** useSearchParams needs a Suspense boundary so the shell can render first. */
export default function AccessControlPage() {
  return (
    <Suspense fallback={null}>
      <AccessControlPageInner />
    </Suspense>
  );
}
