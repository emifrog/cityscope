import type { ComponentProps } from 'react';
import { cn } from './utils';

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-card border border-border bg-surface shadow-sm', className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<'header'>) {
  // A description placed beside the title drops under it, full width, actions staying on the title row.
  return (
    <header
      className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pt-5', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('text-base font-semibold text-foreground', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('basis-full text-sm text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}
