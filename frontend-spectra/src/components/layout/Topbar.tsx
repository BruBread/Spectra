'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Bell, ChevronDown, LogOut, Menu, Settings as SettingsIcon, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../context/AppDataContext';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import { Dropdown, DropdownItem } from '../ui/Dropdown';
import { Badge } from '../ui/Badge';
import { RelativeTime } from '../ui/RelativeTime';
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
  const { notifications, markNotificationRead, markAllNotificationsRead } = useAppData();

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const handleLogout = () => {
    logout();
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
                {unreadCount > 0 ? <span className={styles.badgeDot}>{unreadCount}</span> : null}
              </span>
            </IconButton>
          )}
        >
          {() => (
            <div className={styles.notificationPanel}>
              <div className={styles.notificationHeader}>
                <span>Notifications</span>
                {unreadCount > 0 ? (
                  <button type="button" className={styles.markAll} onClick={markAllNotificationsRead}>
                    Mark all as read
                  </button>
                ) : null}
              </div>
              <div className={styles.notificationList}>
                {notifications.length === 0 ? (
                  <EmptyState title="No notifications" description="You're all caught up." />
                ) : (
                  notifications.slice(0, 6).map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      className={styles.notificationItem}
                      data-unread={!notification.read}
                      onClick={() => markNotificationRead(notification.id)}
                    >
                      <span className={styles.notificationTop}>
                        <span className={styles.notificationTitle}>{notification.title}</span>
                        <Badge
                          tone={
                            notification.severity === 'critical'
                              ? 'danger'
                              : notification.severity === 'warning'
                                ? 'warning'
                                : 'info'
                          }
                        >
                          {notification.severity}
                        </Badge>
                      </span>
                      <span className={styles.notificationMessage}>{notification.message}</span>
                      <RelativeTime iso={notification.timestamp} className={styles.notificationTime} />
                    </button>
                  ))
                )}
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
              <DropdownItem danger onClick={handleLogout}>
                <LogOut size={16} aria-hidden="true" /> Logout
              </DropdownItem>
            </>
          )}
        </Dropdown>
      </div>
    </header>
  );
}
