'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Camera, Home, LogOut, ScrollText, Settings, Users, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/format';
import { SpectraLogo } from '../ui/SpectraLogo';
import styles from './Sidebar.module.css';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/cameras', label: 'Cameras', icon: Camera },
  { href: '/logs', label: 'Logs', icon: ScrollText },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  useEffect(() => {
    onCloseMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <>
      {mobileOpen ? (
        <div className={styles.backdrop} onClick={onCloseMobile} aria-hidden="true" />
      ) : null}
      <nav
        aria-label="Main navigation"
        className={cn(styles.sidebar, mobileOpen && styles.mobileOpen)}
      >
        <div className={styles.top}>
          <div className={styles.brand}>
            <SpectraLogo size={26} className={styles.logoMark} />
            <span className={styles.logoText}>Spectra</span>
          </div>
          <button type="button" className={styles.closeMobile} onClick={onCloseMobile} aria-label="Close menu">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <ul className={styles.navList}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link href={item.href} className={cn(styles.navLink, isActive && styles.navLinkActive)}>
                  <Icon size={18} aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <button type="button" className={styles.logout} onClick={handleLogout}>
          <LogOut size={18} aria-hidden="true" />
          Logout
        </button>
      </nav>
    </>
  );
}
