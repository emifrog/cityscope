import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './utils';

const alertVariants = cva('rounded-md border px-4 py-3 text-sm', {
  variants: {
    tone: {
      info: 'border-info/30 bg-info-soft text-info',
      critical: 'border-critical/30 bg-critical-soft text-critical',
      important: 'border-important/30 bg-important-soft text-important',
    },
  },
  defaultVariants: { tone: 'info' },
});

export type AlertProps = ComponentProps<'div'> & VariantProps<typeof alertVariants>;

export function Alert({ className, tone, role, ...props }: AlertProps) {
  return (
    <div
      role={role ?? (tone === 'critical' ? 'alert' : 'status')}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-subtle', className)} {...props} />;
}
