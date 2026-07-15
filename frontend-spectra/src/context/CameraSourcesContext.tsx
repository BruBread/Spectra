'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CameraRecord, NewCameraInput } from '../lib/cameras/types';
import {
  createCamera as apiCreateCamera,
  deleteCamera as apiDeleteCamera,
  fetchCameras,
  updateCamera as apiUpdateCamera,
} from '../lib/api/cameras';
import { useToast } from './ToastContext';

interface CameraSourcesContextValue {
  cameras: CameraRecord[];
  loading: boolean;
  backendConnected: boolean;
  addCamera: (input: NewCameraInput) => Promise<CameraRecord | null>;
  updateCamera: (id: string, updates: Partial<NewCameraInput & { detectionEnabled: boolean }>) => Promise<void>;
  removeCamera: (id: string) => Promise<void>;
}

const CameraSourcesContext = createContext<CameraSourcesContextValue | null>(null);

export function CameraSourcesProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const [cameras, setCameras] = useState<CameraRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendConnected, setBackendConnected] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchCameras();
      if (cancelled) return;
      if (result.ok && result.data) {
        setCameras(result.data);
      } else {
        setBackendConnected(false);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addCamera = useCallback(
    async (input: NewCameraInput) => {
      const result = await apiCreateCamera(input);
      if (result.ok && result.data) {
        const created = result.data;
        setCameras((current) => [created, ...current]);
        return created;
      }
      showToast(result.error ?? 'Could not add camera — is the backend running?', 'error');
      return null;
    },
    [showToast],
  );

  const updateCamera = useCallback(
    async (id: string, updates: Partial<NewCameraInput & { detectionEnabled: boolean }>) => {
      const result = await apiUpdateCamera(id, updates);
      if (result.ok && result.data) {
        const updated = result.data;
        setCameras((current) => current.map((camera) => (camera.id === id ? updated : camera)));
      } else {
        showToast(result.error ?? 'Could not update camera.', 'error');
      }
    },
    [showToast],
  );

  const removeCamera = useCallback(
    async (id: string) => {
      const result = await apiDeleteCamera(id);
      if (result.ok) {
        setCameras((current) => current.filter((camera) => camera.id !== id));
      } else {
        showToast(result.error ?? 'Could not remove camera.', 'error');
      }
    },
    [showToast],
  );

  return (
    <CameraSourcesContext.Provider value={{ cameras, loading, backendConnected, addCamera, updateCamera, removeCamera }}>
      {children}
    </CameraSourcesContext.Provider>
  );
}

export function useCameraSources(): CameraSourcesContextValue {
  const ctx = useContext(CameraSourcesContext);
  if (!ctx) throw new Error('useCameraSources must be used within a CameraSourcesProvider');
  return ctx;
}
