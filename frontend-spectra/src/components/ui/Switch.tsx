import { useId } from 'react';
import styles from './Switch.module.css';

interface SwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Switch({ label, description, checked, onChange, disabled }: SwitchProps) {
  const id = useId();

  return (
    <div className={styles.row}>
      <div>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={styles.track}
        data-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.thumb} />
      </button>
    </div>
  );
}
