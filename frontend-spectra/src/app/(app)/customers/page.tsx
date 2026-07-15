'use client';

import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useAppData } from '../../../context/AppDataContext';
import { useToast } from '../../../context/ToastContext';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { Pagination } from '../../../components/ui/Pagination';
import { Avatar } from '../../../components/ui/Avatar';
import { AddCustomerModal } from '../../../components/customers/AddCustomerModal';
import { CustomerDetailsModal } from '../../../components/customers/CustomerDetailsModal';
import { formatDate } from '../../../lib/format';
import type { Customer, CustomerStatus } from '../../../lib/types';
import styles from './customers.module.css';

const TONE_BY_STATUS: Record<CustomerStatus, BadgeTone> = {
  active: 'success',
  inactive: 'neutral',
  pending: 'warning',
};

const PAGE_SIZE = 8;

export default function CustomersPage() {
  const { customers, addCustomer, setCustomerStatus } = useAppData();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesSearch =
        term.length === 0 ||
        customer.name.toLowerCase().includes(term) ||
        customer.email.toLowerCase().includes(term) ||
        customer.id.toLowerCase().includes(term);
      const matchesStatus = statusFilter === 'all' || customer.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [customers, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const columns: Column<Customer>[] = [
    { key: 'id', header: 'ID', render: (customer) => <span className={styles.mono}>{customer.id}</span> },
    {
      key: 'name',
      header: 'Name',
      render: (customer) => (
        <span className={styles.nameCell}>
          <Avatar name={customer.name} size={28} />
          {customer.name}
        </span>
      ),
    },
    { key: 'email', header: 'Email', render: (customer) => customer.email },
    {
      key: 'status',
      header: 'Status',
      render: (customer) => <Badge tone={TONE_BY_STATUS[customer.status]}>{customer.status}</Badge>,
    },
    { key: 'joinedOn', header: 'Joined On', render: (customer) => formatDate(customer.joinedOn) },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Customers</h2>
          <p className={styles.subtitle}>View and manage customer accounts.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={16} aria-hidden="true" /> Add Customer
        </Button>
      </div>

      <Card>
        <div className={styles.filters}>
          <Input
            label="Search"
            hideLabel
            placeholder="Search customers…"
            leadingIcon={<Search size={15} aria-hidden="true" />}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className={styles.searchField}
          />
          <Select
            label="Status"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
          </Select>
        </div>

        <DataTable
          columns={columns}
          rows={pageRows}
          getRowId={(customer) => customer.id}
          onRowClick={setSelectedCustomer}
          emptyTitle="No customers match your filters"
          emptyDescription="Try a different search term or clear the filters."
        />

        <Pagination
          page={currentPage}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          itemLabel="customers"
        />
      </Card>

      <AddCustomerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        existingEmails={customers.map((customer) => customer.email.toLowerCase())}
        onSubmit={(input) => {
          addCustomer(input);
          showToast(`${input.name} added as a customer`, 'success');
        }}
      />

      <CustomerDetailsModal
        customer={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        onSetStatus={(id, status) => {
          setCustomerStatus(id, status);
          setSelectedCustomer((current) => (current ? { ...current, status } : current));
        }}
      />
    </div>
  );
}
