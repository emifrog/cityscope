import { Card, CardContent } from '@etare/ui';
import { PageHeader } from './page-header';

/** Placeholder of a module planned in a later sprint (the route structure already exists). */
export function ComingSoon({ title, description, sprint }: { title: string; description: string; sprint: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent>
          <p className="text-sm text-muted">
            Ce module n’est pas encore disponible. Il est prévu au <strong className="text-foreground">{sprint}</strong>
            .
          </p>
        </CardContent>
      </Card>
    </>
  );
}
