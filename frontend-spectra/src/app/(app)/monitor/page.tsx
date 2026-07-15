'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertOctagon, ShieldQuestion } from 'lucide-react';
import { useVisionPipeline } from '../../../lib/vision/useVisionPipeline';
import { createCameraSource } from '../../../lib/vision/cameraSource';
import type { PipelineAlert } from '../../../lib/vision/pipeline';
import { defaultVisionSettings, DEFAULT_CAMERA_ID } from '../../../lib/vision/defaults';
import type { AprilTagMapping, DetectionType, DetectionTypeConfig, VisionSettings } from '../../../lib/vision/types';
import {
  acknowledgeAlert,
  createAlert,
  createAprilTagMapping,
  deleteAprilTagMapping,
  fetchAlerts,
  fetchAprilTagMappings,
  fetchVisionSettings,
  updateAprilTagMapping,
  updateVisionSettings,
} from '../../../lib/api/vision';
import { useToast } from '../../../context/ToastContext';
import { useCameraSources } from '../../../context/CameraSourcesContext';
import { supportsDetection } from '../../../lib/cameras/types';
import { CameraFeed } from '../../../components/monitor/CameraFeed';
import { AlertFeed, type FeedAlert } from '../../../components/monitor/AlertFeed';
import { DetectionSettingsPanel } from '../../../components/monitor/DetectionSettingsPanel';
import { AprilTagMappingManager } from '../../../components/monitor/AprilTagMappingManager';
import { Tabs, TabPanel } from '../../../components/ui/Tabs';
import { Select } from '../../../components/ui/Select';
import styles from './monitor.module.css';

function makeLocalAlertId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function MonitorPage() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const { cameras } = useCameraSources();
  const selectableCameras = useMemo(() => cameras.filter((camera) => supportsDetection(camera.sourceType)), [cameras]);

  const requestedCameraId = searchParams.get('camera');
  const [selectedCameraId, setSelectedCameraId] = useState(requestedCameraId ?? DEFAULT_CAMERA_ID);

  useEffect(() => {
    if (requestedCameraId && requestedCameraId !== selectedCameraId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the URL's ?camera= param, an external navigation source
      setSelectedCameraId(requestedCameraId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedCameraId]);

  const selectedCamera = selectableCameras.find((camera) => camera.id === selectedCameraId) ?? null;

  const [settings, setSettings] = useState<VisionSettings>(() => defaultVisionSettings(selectedCameraId));
  const [mappings, setMappings] = useState<AprilTagMapping[]>([]);
  const [alerts, setAlerts] = useState<FeedAlert[]>([]);
  const [backendConnected, setBackendConnected] = useState(true);
  const [activeTab, setActiveTab] = useState('settings');
  const [previewSnapshot, setPreviewSnapshot] = useState<string | null>(null);

  const settingsLoaded = useRef(false);
  const persistTimeoutRef = useRef<number | null>(null);

  // Settings + alert history are scoped per camera, so they reload whenever the selection changes.
  useEffect(() => {
    let cancelled = false;
    settingsLoaded.current = false;

    (async () => {
      const [settingsResult, alertsResult] = await Promise.all([
        fetchVisionSettings(selectedCameraId),
        fetchAlerts({ cameraId: selectedCameraId, limit: 100 }),
      ]);

      if (cancelled) return;

      if (settingsResult.ok && settingsResult.data) {
        setSettings(settingsResult.data);
      } else {
        setSettings(defaultVisionSettings(selectedCameraId));
        setBackendConnected(false);
      }

      setAlerts(alertsResult.ok && alertsResult.data ? alertsResult.data.map((alert) => ({ ...alert, persisted: true })) : []);

      settingsLoaded.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCameraId]);

  // AprilTag mappings aren't camera-scoped — load once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchAprilTagMappings();
      if (cancelled) return;
      if (result.ok && result.data) {
        setMappings(result.data);
      } else {
        setBackendConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistSettings = useCallback(
    (next: VisionSettings) => {
      if (!settingsLoaded.current) return;
      if (persistTimeoutRef.current) window.clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = window.setTimeout(() => {
        void updateVisionSettings(next).then((result) => {
          if (!result.ok) {
            showToast('Could not save detection settings to the backend — applying locally only.', 'error');
          }
        });
      }, 500);
    },
    [showToast],
  );

  const handleUpdateDetector = useCallback(
    (type: DetectionType, updates: Partial<DetectionTypeConfig>) => {
      setSettings((current) => {
        const next: VisionSettings = {
          ...current,
          detectors: current.detectors.map((detector) => (detector.type === type ? { ...detector, ...updates } : detector)),
        };
        persistSettings(next);
        return next;
      });
    },
    [persistSettings],
  );

  const handleUpdateGlobal = useCallback(
    (updates: Partial<Pick<VisionSettings, 'processingIntervalMs' | 'retentionDays'>>) => {
      setSettings((current) => {
        const next: VisionSettings = { ...current, ...updates };
        persistSettings(next);
        return next;
      });
    },
    [persistSettings],
  );

  const handleAlert = useCallback(
    (alert: PipelineAlert) => {
      const localId = makeLocalAlertId();
      const optimistic: FeedAlert = {
        id: localId,
        cameraId: selectedCameraId,
        type: alert.type,
        confidence: alert.confidence,
        message: alert.message,
        snapshot: alert.snapshot || null,
        metadata: alert.metadata,
        acknowledged: false,
        createdAt: new Date().toISOString(),
        persisted: false,
      };
      setAlerts((current) => [optimistic, ...current].slice(0, 300));

      void createAlert({
        cameraId: selectedCameraId,
        type: alert.type,
        confidence: alert.confidence,
        message: alert.message,
        snapshot: alert.snapshot || null,
        metadata: alert.metadata,
      }).then((result) => {
        if (result.ok && result.data) {
          const saved = result.data;
          setAlerts((current) => current.map((entry) => (entry.id === localId ? { ...saved, persisted: true } : entry)));
        }
      });
    },
    [selectedCameraId],
  );

  const pipeline = useVisionPipeline({
    settings,
    onAlert: handleAlert,
    createSource: selectedCamera ? () => createCameraSource(selectedCamera) : undefined,
  });

  const handleCameraChange = (id: string) => {
    pipeline.stop();
    setSelectedCameraId(id);
  };

  useEffect(() => {
    if (!pipeline.tickResult) return;
    const video = pipeline.videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * 320) || 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Deriving a thumbnail from the live video element (an external system,
    // not React state) each time a new frame has been processed — not a
    // value we can compute during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewSnapshot(canvas.toDataURL('image/jpeg', 0.6));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline.tickResult]);

  const handleAcknowledge = useCallback((id: string) => {
    setAlerts((current) => current.map((alert) => (alert.id === id ? { ...alert, acknowledged: true } : alert)));
    if (!id.startsWith('local-')) {
      void acknowledgeAlert(id);
    }
  }, []);

  const handleAcknowledgeAll = useCallback(() => {
    setAlerts((current) => {
      for (const alert of current) {
        if (!alert.acknowledged && !alert.id.startsWith('local-')) {
          void acknowledgeAlert(alert.id);
        }
      }
      return current.map((alert) => ({ ...alert, acknowledged: true }));
    });
  }, []);

  const handleCreateMapping = useCallback(
    async (input: { tagId: number; label: string; loraDeviceId: string; notes?: string }) => {
      const result = await createAprilTagMapping(input);
      if (result.ok && result.data) {
        setMappings((current) => [...current, result.data as AprilTagMapping].sort((a, b) => a.tagId - b.tagId));
        showToast(`Tag ${input.tagId} mapped to ${input.loraDeviceId}`, 'success');
      } else {
        showToast(result.error ?? 'Could not save the mapping.', 'error');
      }
    },
    [showToast],
  );

  const handleUpdateMapping = useCallback(
    async (id: string, input: { label: string; loraDeviceId: string; notes?: string }) => {
      const result = await updateAprilTagMapping(id, input);
      if (result.ok && result.data) {
        const updated = result.data;
        setMappings((current) => current.map((mapping) => (mapping.id === id ? updated : mapping)));
        showToast('Mapping updated', 'success');
      } else {
        showToast(result.error ?? 'Could not update the mapping.', 'error');
      }
    },
    [showToast],
  );

  const handleDeleteMapping = useCallback(
    async (id: string) => {
      const result = await deleteAprilTagMapping(id);
      if (result.ok) {
        setMappings((current) => current.filter((mapping) => mapping.id !== id));
        showToast('Mapping removed', 'info');
      } else {
        showToast(result.error ?? 'Could not remove the mapping.', 'error');
      }
    },
    [showToast],
  );

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.title}>Live Monitor</h2>
          <p className={styles.subtitle}>
            AI-assisted camera monitoring. Every alert here is a suggestion for a human to verify — not a confirmed
            incident.
          </p>
        </div>
        <Select
          label="Camera"
          value={selectedCameraId}
          onChange={(event) => handleCameraChange(event.target.value)}
          className={styles.cameraSelect}
        >
          <option value={DEFAULT_CAMERA_ID}>This browser&rsquo;s webcam (quick test)</option>
          {selectableCameras.map((camera) => (
            <option key={camera.id} value={camera.id}>
              {camera.name}
            </option>
          ))}
        </Select>
      </div>

      {!backendConnected ? (
        <div className={styles.banner}>
          <AlertOctagon size={16} aria-hidden="true" />
          Backend not reachable — detection settings and AprilTag mappings are using local defaults and won&rsquo;t be
          saved. New alerts still show up here for this session, but aren&rsquo;t persisted.
        </div>
      ) : null}

      <div className={styles.disclaimer}>
        <ShieldQuestion size={16} aria-hidden="true" />
        This system flags patterns worth a human look — it does not reliably identify actual fights, drowning, or
        intoxication, and should never replace direct supervision in safety-critical settings (pools, in particular).
      </div>

      <div className={styles.liveGrid}>
        <CameraFeed {...pipeline} />
        <AlertFeed alerts={alerts} mappings={mappings} onAcknowledge={handleAcknowledge} onAcknowledgeAll={handleAcknowledgeAll} />
      </div>

      <Tabs
        orientation="horizontal"
        items={[
          { id: 'settings', label: 'Detection Settings' },
          { id: 'devices', label: 'AprilTag Devices' },
        ]}
        activeId={activeTab}
        onChange={setActiveTab}
      />

      <TabPanel id="settings" activeId={activeTab}>
        <DetectionSettingsPanel
          settings={settings}
          onUpdateDetector={handleUpdateDetector}
          onUpdateGlobal={handleUpdateGlobal}
          snapshotForZoneEditor={previewSnapshot}
        />
      </TabPanel>
      <TabPanel id="devices" activeId={activeTab}>
        <AprilTagMappingManager
          mappings={mappings}
          onCreate={handleCreateMapping}
          onUpdate={handleUpdateMapping}
          onDelete={handleDeleteMapping}
        />
      </TabPanel>
    </div>
  );
}
