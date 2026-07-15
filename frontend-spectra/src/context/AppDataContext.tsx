'use client';

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createPersistedStore } from '../lib/store';
import { STORAGE_KEYS } from '../lib/storage';
import { generateCustomers, generateLogs, generateNotifications, defaultSettings } from '../lib/mock';
import type {
  AppSettings,
  Customer,
  CustomerStatus,
  LogEntry,
  NewCustomerInput,
  NotificationItem,
  Severity,
} from '../lib/types';

const customersStore = createPersistedStore<Customer[]>(STORAGE_KEYS.customers, () => generateCustomers());
const logsStore = createPersistedStore<LogEntry[]>(STORAGE_KEYS.logs, () => generateLogs());
const notificationsStore = createPersistedStore<NotificationItem[]>(STORAGE_KEYS.notifications, () =>
  generateNotifications(),
);
const settingsStore = createPersistedStore<AppSettings>(STORAGE_KEYS.settings, defaultSettings);

interface AppDataContextValue {
  customers: Customer[];
  addCustomer: (input: NewCustomerInput) => void;
  setCustomerStatus: (id: string, status: CustomerStatus) => void;

  logs: LogEntry[];
  addLog: (entry: { user: string; action: string; details: string; severity: Severity }) => void;

  notifications: NotificationItem[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;

  resetDemoData: () => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

function addLogEntry(entry: { user: string; action: string; details: string; severity: Severity }) {
  logsStore.set((current) => {
    const nextId = String(Math.max(...current.map((log) => Number(log.id) || 0), 0) + 1);
    const newLog: LogEntry = { ...entry, id: nextId, timestamp: new Date().toISOString() };
    return [newLog, ...current];
  });
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const customers = useSyncExternalStore(
    customersStore.subscribe,
    customersStore.getSnapshot,
    customersStore.getServerSnapshot,
  );
  const logs = useSyncExternalStore(logsStore.subscribe, logsStore.getSnapshot, logsStore.getServerSnapshot);
  const notifications = useSyncExternalStore(
    notificationsStore.subscribe,
    notificationsStore.getSnapshot,
    notificationsStore.getServerSnapshot,
  );
  const settings = useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getSnapshot,
    settingsStore.getServerSnapshot,
  );

  const value = useMemo<AppDataContextValue>(
    () => ({
      customers,
      addCustomer: (input) => {
        customersStore.set((current) => {
          const nextIndex = current.length + 1;
          const newCustomer: Customer = {
            id: `CUST-${String(nextIndex).padStart(3, '0')}`,
            name: input.name,
            email: input.email,
            phone: input.phone,
            status: input.status,
            joinedOn: new Date().toISOString(),
          };
          return [newCustomer, ...current];
        });
        addLogEntry({ user: 'Admin', action: 'New Customer', details: `Customer ${input.name} registered`, severity: 'info' });
      },
      setCustomerStatus: (id, status) => {
        const customer = customersStore.getSnapshot().find((cust) => cust.id === id);
        customersStore.set((current) => current.map((cust) => (cust.id === id ? { ...cust, status } : cust)));
        if (customer) {
          addLogEntry({
            user: 'Admin',
            action: 'Customer Update',
            details: `${customer.name} marked as ${status}`,
            severity: status === 'inactive' ? 'warning' : 'info',
          });
        }
      },

      logs,
      addLog: addLogEntry,

      notifications,
      markNotificationRead: (id) => {
        notificationsStore.set((current) =>
          current.map((notification) => (notification.id === id ? { ...notification, read: true } : notification)),
        );
      },
      markAllNotificationsRead: () => {
        notificationsStore.set((current) => current.map((notification) => ({ ...notification, read: true })));
      },

      settings,
      updateSettings: (updates) => {
        settingsStore.set((current) => ({
          ...current,
          ...updates,
          notifications: { ...current.notifications, ...updates.notifications },
          detection: { ...current.detection, ...updates.detection },
        }));
      },

      resetDemoData: () => {
        customersStore.set(generateCustomers());
        logsStore.set(generateLogs());
        notificationsStore.set(generateNotifications());
        settingsStore.set(defaultSettings());
      },
    }),
    [customers, logs, notifications, settings],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within an AppDataProvider');
  return ctx;
}
