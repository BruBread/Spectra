import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/format';
import styles from './IconButton.module.css';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, className, type = 'button', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(styles.button, active && styles.active, className)}
      {...props}
    >
      {children}
    </button>
  );
});
