'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Bell, ChevronDown, LogOut, Menu, Settings as SettingsIcon, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import { Dropdown, DropdownItem } from '../ui/Dropdown';
import { EmptyState } from '../ui/EmptyState';
import styles from './Topbar.module.css';

const TITLES: Record<string, string> = {
  '/': 'Home',
  '/cameras': 'Cameras',
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
              </span>
            </IconButton>
          )}
        >
          {() => (
            <div className={styles.notificationPanel}>
              <div className={styles.notificationHeader}>
                <span>Notifications</span>
              </div>
              <div className={styles.notificationList}>
                {/* No unread badge until this is backed by the API: a count is a
                    claim about real events, and there is nothing recording them yet. */}
                <EmptyState
                  title="Not connected yet"
                  description="Notifications aren't wired to the backend yet. Detections recorded by the vision pipeline appear on the Live Monitor page."
                />
              </div>
            </div>
          )}
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
