import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/format';
import styles from './Select.module.css';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hideLabel?: boolean;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hideLabel, id, className, children, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={cn(styles.field, className)}>
      {label ? (
        <label htmlFor={selectId} className={cn(styles.label, hideLabel && 'visually-hidden')}>
          {label}
        </label>
      ) : null}
      <div className={styles.control}>
        <select ref={ref} id={selectId} className={styles.select} {...props}>
          {children}
        </select>
        <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
      </div>
    </div>
  );
});
