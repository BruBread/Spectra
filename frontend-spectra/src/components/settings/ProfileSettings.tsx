'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import styles from './SettingsPanels.module.css';

export function ProfileSettings() {
  const { user, updateProfile } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: { name?: string; email?: string } = {};
    if (!name.trim()) nextErrors.name = 'Name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = 'Enter a valid email address.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const result = await updateProfile({ name: name.trim(), email: email.trim() });
    setSubmitting(false);

    if (!result.ok) {
      showToast(result.error ?? 'Could not save your profile.', 'error');
      return;
    }
    showToast('Profile updated', 'success');
  };

  return (
    <Card>
      <CardHeader title="Profile Settings" subtitle="Update your profile information." />
      <div className={styles.profileHeader}>
        <Avatar name={name || 'Admin'} size={56} />
      </div>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
        <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} error={errors.email} />
        <div className={styles.actionsRow}>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
