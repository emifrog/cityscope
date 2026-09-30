import type { ComponentProps, ReactNode } from 'react';
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

const fieldClasses =
  'block w-full rounded-md border border-border bg-surface px-3 text-base text-foreground aria-[invalid=true]:border-critical disabled:bg-subtle';

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(fieldClasses, 'h-11', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldClasses, 'min-h-24 py-2', className)} {...props} />;
}

/** Label + control + error message, with the accessibility links between them. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && !error ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      {error ? <FieldError id={`${htmlFor}-error`}>{error}</FieldError> : null}
    </div>
  );
}
