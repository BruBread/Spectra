'use client';

import { useState, type FormEvent } from 'react';
import Hls from 'hls.js';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import type { CameraSourceType, NewCameraInput } from '../../lib/cameras/types';
import { CAMERA_SOURCE_LABELS } from '../../lib/cameras/types';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import styles from './AddCameraModal.module.css';

interface AddCameraModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: NewCameraInput) => Promise<unknown>;
}

const ZONES = ['Zone A', 'Zone B', 'Zone C', 'Zone D'];
const SOURCE_TYPES: CameraSourceType[] = ['local-device', 'hls-stream', 'mjpeg-stream'];

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

export function AddCameraModal({ open, onClose, onSubmit }: AddCameraModalProps) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [zone, setZone] = useState(ZONES[0]);
  const [sourceType, setSourceType] = useState<CameraSourceType>('local-device');
  const [streamUrl, setStreamUrl] = useState('');
  const [errors, setErrors] = useState<{ name?: string; streamUrl?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setLocation('');
    setZone(ZONES[0]);
    setSourceType('local-device');
    setStreamUrl('');
    setErrors({});
    setDevices([]);
    setDeviceError(null);
    setSelectedDeviceId('');
    setTestStatus('idle');
    setTestMessage(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const detectDevices = async () => {
    setDevicesLoading(true);
    setDeviceError(null);
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not support camera access.');
      }
      // Device labels are hidden until permission has been granted at least once.
      const primingStream = await navigator.mediaDevices.getUserMedia({ video: true });
      primingStream.getTracks().forEach((track) => track.stop());

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((device) => device.kind === 'videoinput');
      setDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
      if (videoInputs.length === 0) {
        setDeviceError('No cameras were found on this device.');
      }
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : 'Could not access cameras on this device.');
    } finally {
      setDevicesLoading(false);
    }
  };

  const testStreamUrl = async () => {
    if (!streamUrl.trim()) return;
    setTestStatus('testing');
    setTestMessage(null);

    if (sourceType === 'mjpeg-stream') {
      const ok = await new Promise<boolean>((resolve) => {
        const img = new Image();
        const timeout = window.setTimeout(() => resolve(false), 6000);
        img.onload = () => {
          window.clearTimeout(timeout);
          resolve(true);
        };
        img.onerror = () => {
          window.clearTimeout(timeout);
          resolve(false);
        };
        img.src = streamUrl.trim();
      });
      setTestStatus(ok ? 'ok' : 'error');
      setTestMessage(ok ? 'Stream responded.' : 'Could not load an image from this URL.');
      return;
    }

    // hls-stream
    const video = document.createElement('video');
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari plays HLS natively; we can't verify without actually starting playback, so trust the URL format.
      setTestStatus('ok');
      setTestMessage('Safari supports HLS natively — connection will be verified when the camera starts.');
      return;
    }
    if (!Hls.isSupported()) {
      setTestStatus('error');
      setTestMessage('This browser cannot play HLS streams.');
      return;
    }
    const ok = await new Promise<boolean>((resolve) => {
      const hls = new Hls();
      const timeout = window.setTimeout(() => resolve(false), 8000);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        window.clearTimeout(timeout);
        resolve(true);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          window.clearTimeout(timeout);
          resolve(false);
        }
      });
      hls.loadSource(streamUrl.trim());
      hls.attachMedia(video);
    });
    setTestStatus(ok ? 'ok' : 'error');
    setTestMessage(ok ? 'Manifest loaded successfully.' : 'Could not load an HLS manifest from this URL.');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!name.trim()) nextErrors.name = 'Camera name is required.';
    if (sourceType !== 'local-device' && !streamUrl.trim()) nextErrors.streamUrl = 'Stream URL is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId);

    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        location: location.trim(),
        zone,
        sourceType,
        streamUrl: sourceType === 'local-device' ? undefined : streamUrl.trim(),
        preferredDeviceId: sourceType === 'local-device' ? selectedDeviceId || undefined : undefined,
        preferredDeviceLabel: sourceType === 'local-device' ? selectedDevice?.label || undefined : undefined,
      });
      reset();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Camera"
      description="Connect a real camera source — a device attached to this computer, or a stream URL."
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <Input label="Camera name" placeholder="e.g. West Stairwell" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
        <div className={styles.fieldRow}>
          <Input label="Location (optional)" placeholder="e.g. Engineering Building, 3rd Floor" value={location} onChange={(event) => setLocation(event.target.value)} />
          <Select label="Zone" value={zone} onChange={(event) => setZone(event.target.value)}>
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </div>

        <Select
          label="Source type"
          value={sourceType}
          onChange={(event) => {
            setSourceType(event.target.value as CameraSourceType);
            setTestStatus('idle');
            setTestMessage(null);
          }}
        >
          {SOURCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {CAMERA_SOURCE_LABELS[type]}
            </option>
          ))}
        </Select>

        {sourceType === 'local-device' ? (
          <div className={styles.deviceSection}>
            <div className={styles.deviceHeader}>
              <p className={styles.deviceHint}>
                Detect cameras attached to <strong>this computer and browser</strong>. This is inherently local to
                whoever is viewing this page — a device picked here won&rsquo;t be available if Spectra is opened from
                a different machine.
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={() => void detectDevices()} disabled={devicesLoading}>
                <RefreshCw size={14} aria-hidden="true" className={devicesLoading ? styles.spin : undefined} />
                {devicesLoading ? 'Detecting…' : 'Detect Cameras'}
              </Button>
            </div>

            {deviceError ? <p className={styles.deviceError}>{deviceError}</p> : null}

            {devices.length > 0 ? (
              <Select label="Camera device" value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)}>
                {devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </Select>
            ) : (
              <p className={styles.deviceHint}>
                No device selected yet — the camera will use this browser&rsquo;s default camera when started.
              </p>
            )}
          </div>
        ) : (
          <div className={styles.deviceSection}>
            <Input
              label={sourceType === 'hls-stream' ? 'HLS stream URL (.m3u8)' : 'MJPEG stream URL'}
              placeholder={sourceType === 'hls-stream' ? 'https://example.com/stream/index.m3u8' : 'http://camera-ip/video.mjpg'}
              value={streamUrl}
              onChange={(event) => {
                setStreamUrl(event.target.value);
                setTestStatus('idle');
                setTestMessage(null);
              }}
              error={errors.streamUrl}
              hint={
                sourceType === 'mjpeg-stream'
                  ? 'AI detection isn’t available for MJPEG yet — it renders as a live preview only.'
                  : undefined
              }
            />
            <div className={styles.testRow}>
              <Button type="button" variant="secondary" size="sm" onClick={() => void testStreamUrl()} disabled={!streamUrl.trim() || testStatus === 'testing'}>
                {testStatus === 'testing' ? 'Testing…' : 'Test Connection'}
              </Button>
              {testStatus === 'ok' ? (
                <span className={styles.testOk}>
                  <CheckCircle2 size={14} aria-hidden="true" /> {testMessage}
                </span>
              ) : null}
              {testStatus === 'error' ? (
                <span className={styles.testError}>
                  <XCircle size={14} aria-hidden="true" /> {testMessage}
                </span>
              ) : null}
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add Camera'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
