import styles from './FullPageLoader.module.css';

export function FullPageLoader() {
  return (
    <div className={styles.wrapper} role="status" aria-label="Loading Spectra">
      <span className={styles.spinner} aria-hidden="true" />
    </div>
  );
}
