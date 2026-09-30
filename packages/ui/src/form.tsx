import type { ComponentProps } from 'react';
import { cn } from './utils';

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('block text-sm font-medium text-foreground', className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'block h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted',
        'aria-[invalid=true]:border-critical disabled:bg-subtle',
        className,
      )}
      {...props}
    />
  );
}

export function FieldError({ className, ...props }: ComponentProps<'p'>) {
  return <p role="alert" className={cn('mt-1 text-sm text-critical', className)} {...props} />;
}
