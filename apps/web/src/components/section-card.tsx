import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@etare/ui';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * A card headed by a pictogram, a title and a short description, with room for a status on the
 * right (badge, action). The pictogram helps scanning a page made of several cards.
 */
export function SectionCard({
  icon: Icon,
  title,
  description,
  aside,
  className,
  contentClassName,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string | undefined;
  contentClassName?: string | undefined;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader className="items-start">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-subtle text-brand-navy"
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription className="mt-0.5">{description}</CardDescription> : null}
          </div>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}
