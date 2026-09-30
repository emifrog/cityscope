'use client';

import { Button } from '@etare/ui';
import { ApiErrorAlert } from '@/components/feedback';
import { api } from '@/lib/api-client';
import { openInNewTab } from '@/lib/open-link';
import { useApiMutation } from '@/lib/queries';

/** ETARE PDF of a publication (ETARE-02): a 60 s signed URL, requested at click time and traced. */
export function PublicationPdfButton({ publicationId, number }: { publicationId: string; number: number }) {
  const download = useApiMutation(
    (options, id: string) => api.getPublicationPdf(options, id),
    () => [],
  );
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={download.isPending}
        onClick={() => download.mutate(publicationId, { onSuccess: (ticket) => openInNewTab(ticket.url) })}
      >
        {download.isPending ? 'Préparation…' : `PDF de la version n° ${number}`}
      </Button>
      {download.error ? <ApiErrorAlert error={download.error} /> : null}
    </div>
  );
}
