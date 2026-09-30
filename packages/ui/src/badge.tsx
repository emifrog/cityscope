import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './utils';

export const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    tone: {
      neutral: 'bg-subtle text-muted',
      info: 'bg-info-soft text-info',
      success: 'bg-success-soft text-success',
      important: 'bg-important-soft text-important',
      critical: 'bg-critical-soft text-critical',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
