'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import styles from './SettingsPanels.module.css';

interface FormErrors {
  current?: string;
  next?: string;
  confirm?: string;
}

export function SecuritySettings() {
  const { logout, changePassword } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: FormErrors = {};

    // The current password is verified by the backend — the browser has no
    // copy of it to check against.
    if (!current) nextErrors.current = 'Enter your current password.';

    if (!next) nextErrors.next = 'Enter a new password.';
    else if (next.length < 8) nextErrors.next = 'Password must be at least 8 characters.';
    else if (next === current) nextErrors.next = 'New password must be different from the current one.';

    if (confirm !== next) nextErrors.confirm = 'Passwords do not match.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const result = await changePassword(current, next);
    setSubmitting(false);

    if (!result.ok) {
      setErrors({ current: result.error ?? 'Could not change your password.' });
      return;
    }

    setCurrent('');
    setNext('');
    setConfirm('');
    showToast('Password updated successfully', 'success');
  };

  const handleSignOutEverywhere = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <>
      <Card>
        <CardHeader title="Change Password" subtitle="Choose a strong password you don't use elsewhere." />
        <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
          <Input
            label="Current password"
            type={showPasswords ? 'text' : 'password'}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            error={errors.current}
            autoComplete="current-password"
          />
          <Input
            label="New password"
            type={showPasswords ? 'text' : 'password'}
            value={next}
            onChange={(event) => setNext(event.target.value)}
            error={errors.next}
            hint="At least 8 characters."
            autoComplete="new-password"
          />
          <Input
            label="Confirm new password"
            type={showPasswords ? 'text' : 'password'}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            error={errors.confirm}
            autoComplete="new-password"
            trailingSlot={
              <button
                type="button"
                className={styles.toggleVisibility}
                onClick={() => setShowPasswords((prev) => !prev)}
                aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
              >
                {showPasswords ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            }
          />
          <div className={styles.actionsRow}>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Changing…' : 'Change Password'}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Session" subtitle="Manage where you're signed in." />
        <p className={styles.helperText}>Signing out will end your current session and return you to the login screen.</p>
        <div className={styles.actionsRow}>
          <Button variant="danger" onClick={() => void handleSignOutEverywhere()}>
            Sign out
          </Button>
        </div>
      </Card>
    </>
  );
}
