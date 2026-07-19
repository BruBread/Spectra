'use client';

import { useCallback, useEffect, useState } from 'react';
import { IdCard, Loader2, PlugZap, Plus, Printer, RefreshCw, SearchX, Tag, Trash2, UserPlus, Vibrate } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { failed, loaded, loading, type LoadState } from '../../lib/accessControl/loadState';
import type { AccessRole, LoraDevice, Person } from '../../lib/accessControl/types';
import { fetchLoraDevices, fetchPeople, issueAprilTag, updatePerson } from '../../lib/api/accessControl';
import { fetchDeviceCapabilities, type DeviceCapabilities } from '../../lib/api/deviceCommands';
import { TestHapticModal } from './TestHapticModal';
import { AprilTagPrintModal } from './AprilTagPrintModal';
import { RemovePersonModal } from './RemovePersonModal';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { DataTable, type Column } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { CredentialSummary } from './CredentialSummary';
import { PersonDetailModal } from './PersonDetailModal';
import { PersonFormModal } from './PersonFormModal';
import styles from './accessControl.module.css';

interface PeoplePanelProps {
  roles: LoadState<AccessRole[]>;
  canEdit: boolean;
  /** Reassigning or deactivating a person changes what a role can be deleted for. */
  onPeopleChanged: () => void;
}

type StatusFilter = 'all' | 'active' | 'inactive';

export function PeoplePanel({ roles, canEdit, onPeopleChanged }: PeoplePanelProps) {
  const { showToast } = useToast();
  const [people, setPeople] = useState<LoadState<Person[]>>(loading([]));
  const [devices, setDevices] = useState<LoadState<LoraDevice[]>>(loading([]));

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  // Removed and deactivated people are archived out of the default view; the
  // Status filter reveals them when needed.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const [editing, setEditing] = useState<Person | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Person | null>(null);
  const [removing, setRemoving] = useState<Person | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The whole Test Haptic affordance is hidden unless the backend reports
  // simulation is enabled — it is a local/development tool only, never offered
  // where it could only 403.
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [testingPerson, setTestingPerson] = useState<Person | null>(null);
  const [printingPerson, setPrintingPerson] = useState<Person | null>(null);

  // 'active' is the default view, so it doesn't count as a narrowing filter for
  // the empty-state copy — only searching, a role, or a non-default status does.
  const filtersActive = debouncedSearch !== '' || roleFilter !== 'all' || statusFilter !== 'active';

  const loadPeople = useCallback(async () => {
    setPeople((current) => (current.status === 'ok' ? current : loading([])));
    const result = await fetchPeople({
      q: debouncedSearch || undefined,
      roleId: roleFilter === 'all' ? undefined : roleFilter,
      active: statusFilter === 'all' ? undefined : statusFilter === 'active',
    });
    setPeople(result.ok && result.data ? loaded(result.data) : failed([], result.error ?? 'Could not load people.'));
  }, [debouncedSearch, roleFilter, statusFilter]);

  const loadDevices = useCallback(async () => {
    const result = await fetchLoraDevices();
    setDevices(result.ok && result.data ? loaded(result.data) : failed([], result.error ?? 'Could not load LoRa devices.'));
  }, []);

  // Typing shouldn't fire a request per keystroke; the search itself runs on
  // the backend so results are never a filtered slice of a truncated page.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching from the backend when the filter set changes; the loading flip is the point, not a derived value
    void loadPeople();
  }, [loadPeople]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching the LoRa device list from the backend on mount
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    // Simulation availability is a backend fact; if the probe fails we simply
    // leave the affordance hidden rather than guess. setState here is inside an
    // async callback, so it doesn't trip the set-state-in-effect rule.
    void fetchDeviceCapabilities().then((result) => {
      if (result.ok && result.data) setCapabilities(result.data);
    });
  }, []);

  const afterMutation = () => {
    void loadPeople();
    // Assignment state on the device list moves with the person's credential.
    void loadDevices();
    onPeopleChanged();
  };

  const handleToggleActive = async (person: Person) => {
    setBusyId(person.id);
    const result = await updatePerson(person.id, { active: !person.active });
    setBusyId(null);

    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Could not update this person.', 'error');
      return;
    }
    showToast(`${result.data.name} ${result.data.active ? 'reactivated' : 'deactivated'}`, 'success');
    afterMutation();
  };

  const handleIssueAprilTag = async (person: Person) => {
    setBusyId(person.id);
    const result = await issueAprilTag(person.id);
    setBusyId(null);

    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Could not issue an AprilTag.', 'error');
      return;
    }
    showToast(`AprilTag ${result.data.aprilTagId} issued to ${result.data.name}`, 'success');
    afterMutation();
  };

  const columns: Column<Person>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (person) => (
        <div className={styles.cellStack}>
          <span>{person.name}</span>
          {person.notes ? <span className={styles.cellMuted}>{person.notes}</span> : null}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (person) =>
        person.role ? (
          <div className={styles.cellStack}>
            <span>{person.role.name}</span>
            <span className={styles.mono}>{person.role.key}</span>
            {person.role.active ? null : <span className={styles.cellMuted}>Role deactivated</span>}
          </div>
        ) : (
          <span className={styles.cellMuted}>Unresolved</span>
        ),
    },
    { key: 'credentials', header: 'Credentials', render: (person) => <CredentialSummary person={person} /> },
    {
      key: 'status',
      header: 'Status',
      render: (person) => <Badge tone={person.active ? 'success' : 'neutral'}>{person.active ? 'Active' : 'Deactivated'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (person) => (
        <div className={styles.rowActions}>
          <Button variant="ghost" size="sm" onClick={() => setViewing(person)}>
            View
          </Button>
          {canEdit ? (
            <>
              {/* Issue the next free AprilTag: admin only, for an active person
                  who has none (e.g. reactivated after a release). */}
              {person.active && person.aprilTagId === null ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === person.id}
                  onClick={() => void handleIssueAprilTag(person)}
                >
                  <Tag size={14} aria-hidden="true" /> Issue AprilTag
                </Button>
              ) : null}
              {/* Print the physical AprilTag: admin only, and only for someone
                  who actually has one assigned. */}
              {person.aprilTagId !== null ? (
                <Button variant="ghost" size="sm" onClick={() => setPrintingPerson(person)}>
                  <Printer size={14} aria-hidden="true" /> Print AprilTag
                </Button>
              ) : null}
              {/* Simulated haptic test: admin only, active person with an
                  assigned LoRa device, and only where simulation is enabled. */}
              {capabilities?.simulationEnabled && person.active && person.loraDeviceId ? (
                <Button variant="ghost" size="sm" onClick={() => setTestingPerson(person)}>
                  <Vibrate size={14} aria-hidden="true" /> Test haptic
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" onClick={() => setEditing(person)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busyId === person.id}
                onClick={() => void handleToggleActive(person)}
              >
                {person.active ? 'Deactivate' : 'Reactivate'}
              </Button>
              {/* Remove and release: archives the person and frees both
                  credentials — the only path that returns a tag to the pool. */}
              <Button variant="ghost" size="sm" onClick={() => setRemoving(person)}>
                <Trash2 size={14} aria-hidden="true" /> Remove
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.note}>
        <IdCard size={16} aria-hidden="true" />
        <span>
          A readable, registered <strong>AprilTag</strong> is what lets a camera recognize a person and apply their
          role. A <strong>LoRa device</strong> only corroborates that a registered wristband is active nearby — it never
          identifies the person in a frame and grants no permissions on its own. Someone without a readable AprilTag is
          unidentified, even if their wristband is right there.
        </span>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <Input
            label="Search"
            className={styles.searchField}
            placeholder="Search by name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            label="Role"
            className={styles.filterField}
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="all">All roles</option>
            {roles.data.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
          <Select
            label="Status"
            className={styles.filterField}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </Select>
        </div>

        <div className={styles.toolbarActions}>
          <Button variant="secondary" size="sm" onClick={() => void loadPeople()} disabled={people.status === 'loading'}>
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </Button>
          {canEdit ? (
            <Button size="sm" onClick={() => setCreating(true)} disabled={roles.data.length === 0}>
              <Plus size={14} aria-hidden="true" /> Add person
            </Button>
          ) : null}
        </div>
      </div>

      <Card padding="sm">
        {people.status === 'loading' ? (
          <EmptyState icon={<Loader2 size={20} className={styles.spin} aria-hidden="true" />} title="Loading people…" />
        ) : people.status === 'error' ? (
          <EmptyState
            icon={<PlugZap size={20} aria-hidden="true" />}
            title="Could not load people"
            description={people.error ?? undefined}
            action={
              <Button variant="secondary" size="sm" onClick={() => void loadPeople()}>
                Try again
              </Button>
            }
          />
        ) : people.data.length === 0 && filtersActive ? (
          <EmptyState
            icon={<SearchX size={20} aria-hidden="true" />}
            title="No people match these filters"
            description="Other people may exist outside this filter set."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setRoleFilter('all');
                  setStatusFilter('active');
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : people.data.length === 0 ? (
          <EmptyState
            icon={<UserPlus size={20} aria-hidden="true" />}
            title="No people registered yet"
            description="Nobody has been registered. Add a person to give them a role, and an AprilTag if they carry one."
          />
        ) : (
          <DataTable columns={columns} rows={people.data} getRowId={(person) => person.id} />
        )}
      </Card>

      {creating || editing ? (
        <PersonFormModal
          person={editing}
          roles={roles.data}
          devices={devices}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(person) => {
            const wasCreate = editing === null;
            setCreating(false);
            setEditing(null);
            // After creation, surface the automatically assigned tag number.
            showToast(
              wasCreate && person.aprilTagId !== null
                ? `${person.name} added — AprilTag ${person.aprilTagId} assigned`
                : `${person.name} saved`,
              'success',
            );
            afterMutation();
          }}
        />
      ) : null}

      {testingPerson && capabilities ? (
        <TestHapticModal person={testingPerson} capabilities={capabilities} onClose={() => setTestingPerson(null)} />
      ) : null}

      {printingPerson ? (
        <AprilTagPrintModal person={printingPerson} onClose={() => setPrintingPerson(null)} />
      ) : null}

      {removing ? (
        <RemovePersonModal
          person={removing}
          onClose={() => setRemoving(null)}
          onRemoved={(person) => {
            setRemoving(null);
            showToast(`${person.name} removed — credentials released`, 'success');
            afterMutation();
          }}
        />
      ) : null}

      {viewing ? (
        <PersonDetailModal
          person={viewing}
          canEdit={canEdit}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
        />
      ) : null}
    </div>
  );
}
