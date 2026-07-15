'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { AppDataProvider } from '../../context/AppDataContext';
import { Sidebar } from '../../components/layout/Sidebar';
import { Topbar } from '../../components/layout/Topbar';
import { FullPageLoader } from '../../components/ui/FullPageLoader';
import styles from './app-layout.module.css';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return <FullPageLoader />;
  }

  return (
    <AppDataProvider>
      <div className={styles.shell}>
        <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
        <div className={styles.main}>
          <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
          <main className={styles.content}>{children}</main>
        </div>
      </div>
    </AppDataProvider>
  );
}
