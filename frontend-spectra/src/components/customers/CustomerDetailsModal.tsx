import { Mail, Phone } from 'lucide-react';
import type { Customer, CustomerStatus } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { formatDate } from '../../lib/format';
import styles from './CustomerDetailsModal.module.css';

const TONE_BY_STATUS: Record<CustomerStatus, BadgeTone> = {
  active: 'success',
  inactive: 'neutral',
  pending: 'warning',
};

interface CustomerDetailsModalProps {
  customer: Customer | null;
  onClose: () => void;
  onSetStatus: (id: string, status: CustomerStatus) => void;
}

export function CustomerDetailsModal({ customer, onClose, onSetStatus }: CustomerDetailsModalProps) {
  if (!customer) return null;

  return (
    <Modal open={Boolean(customer)} onClose={onClose} title="Customer Profile" size="sm">
      <div className={styles.wrapper}>
        <div className={styles.header}>
          <Avatar name={customer.name} size={48} />
          <div>
            <p className={styles.name}>{customer.name}</p>
            <Badge tone={TONE_BY_STATUS[customer.status]}>{customer.status}</Badge>
          </div>
        </div>

        <dl className={styles.grid}>
          <div>
            <dt>
              <Mail size={12} aria-hidden="true" /> Email
            </dt>
            <dd>{customer.email}</dd>
          </div>
          <div>
            <dt>
              <Phone size={12} aria-hidden="true" /> Phone
            </dt>
            <dd>{customer.phone}</dd>
          </div>
          <div>
            <dt>Customer ID</dt>
            <dd className={styles.mono}>{customer.id}</dd>
          </div>
          <div>
            <dt>Joined on</dt>
            <dd>{formatDate(customer.joinedOn)}</dd>
          </div>
        </dl>

        <div className={styles.actions}>
          {customer.status !== 'active' ? (
            <Button size="sm" onClick={() => onSetStatus(customer.id, 'active')}>
              Activate
            </Button>
          ) : null}
          {customer.status !== 'inactive' ? (
            <Button size="sm" variant="danger" onClick={() => onSetStatus(customer.id, 'inactive')}>
              Deactivate
            </Button>
          ) : null}
          {customer.status !== 'pending' ? (
            <Button size="sm" variant="secondary" onClick={() => onSetStatus(customer.id, 'pending')}>
              Mark pending
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
