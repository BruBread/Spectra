'use client';

import { useState } from 'react';
import { Bell, Cog, Shield, SlidersHorizontal, User } from 'lucide-react';
import { Tabs, TabPanel } from '../../../components/ui/Tabs';
import { ProfileSettings } from '../../../components/settings/ProfileSettings';
import { NotificationSettings } from '../../../components/settings/NotificationSettings';
import { SecuritySettings } from '../../../components/settings/SecuritySettings';
import { GeneralSettings } from '../../../components/settings/GeneralSettings';
import { SystemSettings } from '../../../components/settings/SystemSettings';
import styles from './settings.module.css';

const TABS = [
  { id: 'profile', label: 'Profile', icon: <User size={16} aria-hidden="true" /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={16} aria-hidden="true" /> },
  { id: 'security', label: 'Security', icon: <Shield size={16} aria-hidden="true" /> },
  { id: 'general', label: 'General', icon: <SlidersHorizontal size={16} aria-hidden="true" /> },
  { id: 'system', label: 'System', icon: <Cog size={16} aria-hidden="true" /> },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className={styles.page}>
      <div>
        <h2 className={styles.title}>Settings</h2>
        <p className={styles.subtitle}>Manage system preferences and configurations.</p>
      </div>

      <div className={styles.layout}>
        <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} />

        <div className={styles.panels}>
          <TabPanel id="profile" activeId={activeTab}>
            <ProfileSettings />
          </TabPanel>
          <TabPanel id="notifications" activeId={activeTab}>
            <NotificationSettings />
          </TabPanel>
          <TabPanel id="security" activeId={activeTab}>
            <SecuritySettings />
          </TabPanel>
          <TabPanel id="general" activeId={activeTab}>
            <GeneralSettings />
          </TabPanel>
          <TabPanel id="system" activeId={activeTab}>
            <SystemSettings />
          </TabPanel>
        </div>
      </div>
    </div>
  );
}
