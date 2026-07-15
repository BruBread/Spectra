'use client';

import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { SpectraLogo } from '../../components/ui/SpectraLogo';
import { DEMO_EMAIL, demoPasswordStore } from '../../lib/auth';
import styles from './login.module.css';

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const demoPassword = useSyncExternalStore(
    demoPasswordStore.subscribe,
    demoPasswordStore.getSnapshot,
    demoPasswordStore.getServerSnapshot,
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (!password) {
      errors.password = 'Password is required.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    const result = login(email, password);
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error ?? 'Unable to sign in. Please try again.');
      return;
    }
    router.push('/');
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <SpectraLogo size={30} className={styles.logoMark} />
          <span className={styles.logoText}>Spectra</span>
        </div>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle}>Sign in to monitor cameras, alerts and customers.</p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {formError ? (
            <div className={styles.formError} role="alert" aria-live="assertive">
              {formError}
            </div>
          ) : null}

          <Input
            label="Email address"
            type="email"
            autoComplete="username"
            placeholder="you@spectra.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
          />

          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
            trailingSlot={
              <button
                type="button"
                className={styles.toggleVisibility}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            }
          />

          <Button type="submit" disabled={submitting} className={styles.submit}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className={styles.demoHint}>
          <ShieldCheck size={16} aria-hidden="true" />
          <div>
            <p className={styles.demoTitle}>Demo credentials</p>
            <p>
              {DEMO_EMAIL} / {demoPassword}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
