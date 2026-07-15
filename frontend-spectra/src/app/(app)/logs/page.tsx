'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useAppData } from '../../../context/AppDataContext';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { Pagination } from '../../../components/ui/Pagination';
import { LogDetailsDrawer } from '../../../components/logs/LogDetailsDrawer';
import { formatDateTime } from '../../../lib/format';
import type { LogEntry } from '../../../lib/types';
import styles from './logs.module.css';

const TONE_BY_SEVERITY: Record<LogEntry['severity'], BadgeTone> = {
  info: 'info',
  warning: 'warning',
  critical: 'danger',
};

const PAGE_SIZE = 8;

export default function LogsPage() {
  const { logs } = useAppData();
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  const actionOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.action))).sort(), [logs]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesSearch =
        term.length === 0 ||
        log.id.includes(term) ||
        log.user.toLowerCase().includes(term) ||
        log.action.toLowerCase().includes(term) ||
        log.details.toLowerCase().includes(term);
      const matchesDate = !dateFilter || log.timestamp.slice(0, 10) === dateFilter;
      const matchesAction = actionFilter === 'all' || log.action === actionFilter;
      const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;
      return matchesSearch && matchesDate && matchesAction && matchesSeverity;
    });
  }, [logs, search, dateFilter, actionFilter, severityFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const updateFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const columns: Column<LogEntry>[] = [
    { key: 'id', header: 'ID', render: (log) => <span className={styles.mono}>{log.id}</span> },
    { key: 'user', header: 'User', render: (log) => log.user },
    { key: 'action', header: 'Action', render: (log) => log.action },
    {
      key: 'details',
      header: 'Details',
      render: (log) => <span className={styles.detailsCell}>{log.details}</span>,
      className: styles.detailsColumn,
    },
    { key: 'timestamp', header: 'Date & Time', render: (log) => formatDateTime(log.timestamp) },
    {
      key: 'severity',
      header: 'Severity',
      render: (log) => <Badge tone={TONE_BY_SEVERITY[log.severity]}>{log.severity}</Badge>,
    },
  ];

  return (
    <div className={styles.page}>
      <div>
        <h2 className={styles.title}>Logs</h2>
        <p className={styles.subtitle}>View and filter system logs.</p>
      </div>

      <Card>
        <div className={styles.filters}>
          <Input
            label="Search"
            hideLabel
            placeholder="Search by ID, user or action…"
            leadingIcon={<Search size={15} aria-hidden="true" />}
            value={search}
            onChange={(event) => updateFilter(setSearch)(event.target.value)}
            className={styles.searchField}
          />
          <Input
            label="Date"
            type="date"
            value={dateFilter}
            onChange={(event) => updateFilter(setDateFilter)(event.target.value)}
          />
          <Select label="Action" value={actionFilter} onChange={(event) => updateFilter(setActionFilter)(event.target.value)}>
            <option value="all">All actions</option>
            {actionOptions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </Select>
          <Select
            label="Severity"
            value={severityFilter}
            onChange={(event) => updateFilter(setSeverityFilter)(event.target.value)}
          >
            <option value="all">All severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </Select>
        </div>

        <DataTable
          columns={columns}
          rows={pageRows}
          getRowId={(log) => log.id}
          onRowClick={setSelectedLog}
          emptyTitle="No logs match your filters"
          emptyDescription="Try a different search term or clear the filters."
        />

        <Pagination
          page={currentPage}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          itemLabel="logs"
        />
      </Card>

      <LogDetailsDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
