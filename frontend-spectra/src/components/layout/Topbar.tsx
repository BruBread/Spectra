'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Bell, ChevronDown, LogOut, Menu, Settings as SettingsIcon, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAlertCounts } from '../../context/AlertCountsContext';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import { Dropdown, DropdownItem } from '../ui/Dropdown';
import { TopbarNotifications } from './TopbarNotifications';
import styles from './Topbar.module.css';

const TITLES: Record<string, string> = {
  '/': 'Home',
  '/cameras': 'Cameras',
  '/notifications': 'Notifications',
  '/logs': 'Logs',
  '/customers': 'Customers',
  '/settings': 'Settings',
};

function pageTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const base = `/${pathname.split('/')[1] ?? ''}`;
  return TITLES[base] ?? 'Spectra';
}

interface TopbarProps {
  onOpenMobileNav: () => void;
}

export function Topbar({ onOpenMobileNav }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { counts, status: countsStatus } = useAlertCounts();

  // Only shown when the counts request actually succeeded — a badge is a claim
  // about real unread alerts, so a failed poll shows no badge rather than "0".
  const unread = countsStatus === 'ok' ? counts?.unread ?? 0 : 0;
  const criticalOpen = countsStatus === 'ok' ? counts?.criticalOpen ?? 0 : 0;

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <IconButton label="Open menu" className={styles.menuButton} onClick={onOpenMobileNav}>
          <Menu size={20} aria-hidden="true" />
        </IconButton>
        <h1 className={styles.title}>{pageTitle(pathname)}</h1>
      </div>

      <div className={styles.right}>
        <Dropdown
          align="right"
          trigger={({ onClick, ref, open }) => (
            <IconButton ref={ref} label="Notifications" active={open} onClick={onClick}>
              <span className={styles.bellWrapper}>
                <Bell size={19} aria-hidden="true" />
                {unread > 0 ? (
                  <span className={styles.badgeDot} data-critical={criticalOpen > 0}>
                    {unread > 99 ? '99+' : unread}
                  </span>
                ) : null}
              </span>
            </IconButton>
          )}
        >
          {(close) => <TopbarNotifications onNavigate={close} />}
        </Dropdown>

        <Dropdown
          align="right"
          trigger={({ onClick, ref, open }) => (
            <button type="button" ref={ref} className={styles.profileTrigger} onClick={onClick} aria-expanded={open}>
              <Avatar name={user?.name ?? 'Admin'} size={32} />
              <span className={styles.profileName}>{user?.name ?? 'Admin'}</span>
              <ChevronDown size={14} aria-hidden="true" className={styles.chevron} />
            </button>
          )}
        >
          {(close) => (
            <>
              <DropdownItem
                onClick={() => {
                  close();
                  router.push('/settings');
                }}
              >
                <User size={16} aria-hidden="true" /> Profile
              </DropdownItem>
              <DropdownItem
                onClick={() => {
                  close();
                  router.push('/settings');
                }}
              >
                <SettingsIcon size={16} aria-hidden="true" /> Settings
              </DropdownItem>
              <DropdownItem danger onClick={() => void handleLogout()}>
                <LogOut size={16} aria-hidden="true" /> Logout
              </DropdownItem>
            </>
          )}
        </Dropdown>
      </div>
    </header>
  );
}
