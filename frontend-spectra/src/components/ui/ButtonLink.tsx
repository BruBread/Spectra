import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/format';
import buttonStyles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function ButtonLink({ variant = 'secondary', size = 'md', className, ...props }: ButtonLinkProps) {
  return (
    <Link
      className={cn(buttonStyles.button, buttonStyles[variant], buttonStyles[size], className)}
      {...props}
    />
  );
}
