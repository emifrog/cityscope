import type { ComponentProps } from 'react';
import { cn } from './utils';

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  );
}

export function TableHead({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-subtle text-left text-muted', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-border last:border-0', className)} {...props} />;
}

export function TableHeaderCell({ className, ...props }: ComponentProps<'th'>) {
  return <th scope="col" className={cn('px-4 py-2 font-semibold', className)} {...props} />;
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />;
}
