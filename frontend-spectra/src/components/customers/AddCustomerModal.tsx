'use client';

import { useState, type FormEvent } from 'react';
import type { CustomerStatus, NewCustomerInput } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import styles from './AddCustomerModal.module.css';

interface AddCustomerModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: NewCustomerInput) => void;
  existingEmails: string[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AddCustomerModal({ open, onClose, onSubmit, existingEmails }: AddCustomerModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<CustomerStatus>('active');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  const reset = () => {
    setName('');
    setEmail('');
    setPhone('');
    setStatus('active');
    setErrors({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: { name?: string; email?: string } = {};
    if (!name.trim()) nextErrors.name = 'Full name is required.';
    if (!email.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    } else if (existingEmails.includes(email.trim().toLowerCase())) {
      nextErrors.email = 'A customer with this email already exists.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({ name: name.trim(), email: email.trim(), phone: phone.trim() || '—', status });
    reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add Customer" description="Create a new customer account.">
      <form className={styles.form} onSubmit={handleSubmit}>
        <Input label="Full name" placeholder="e.g. Jordan Blake" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
        <Input
          label="Email address"
          type="email"
          placeholder="jordan.blake@email.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />
        <div className={styles.fieldRow}>
          <Input
            label="Phone (optional)"
            placeholder="(555) 123-4567"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value as CustomerStatus)}>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit">Add Customer</Button>
        </div>
      </form>
    </Modal>
  );
}
