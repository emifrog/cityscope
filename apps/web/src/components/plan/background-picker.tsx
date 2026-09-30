'use client';

import { Field, Input, cn } from '@etare/ui';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useState } from 'react';
import { ApiRequestError } from '@/lib/api-client';
import { imageBackground, openPdf, pdfPageBackground, pdfThumbnail, type PlanBackground } from '@/lib/plan-image';

const ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf,.png,.jpg,.jpeg,.webp,.pdf';
/** Pages previewed at once: large sets of drawings are browsed page by page. */
const THUMBNAILS_PER_VIEW = 12;

const messageOf = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : 'Fichier illisible : choisissez une image ou un PDF.';

/**
 * Chooses the background of a plan: an image as it is, or one page of a PDF
 * rendered to an image in the browser (the image is what is checked,
 * validated and published).
 */
export function BackgroundPicker({
  id,
  onChange,
}: {
  id: string;
  onChange: (background: PlanBackground | null) => void;
}) {
  const [pdf, setPdf] = useState<{ document: PDFDocumentProxy; name: string } | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [firstPage, setFirstPage] = useState(1);
  const [chosen, setChosen] = useState<PlanBackground | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Thumbnails of the visible pages of the PDF.
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    const last = Math.min(pdf.document.numPages, firstPage + THUMBNAILS_PER_VIEW - 1);
    void (async () => {
      for (let page = firstPage; page <= last; page += 1) {
        const image = await pdfThumbnail(pdf.document, page);
        if (cancelled) return;
        setThumbnails((current) => ({ ...current, [page]: image }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, firstPage]);

  async function select(file: File | null) {
    setError(undefined);
    setChosen(null);
    setPdf(null);
    setThumbnails({});
    setFirstPage(1);
    onChange(null);
    if (!file) return;
    setBusy(true);
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        const document = await openPdf(file);
        setPdf({ document, name: file.name });
        if (document.numPages === 1) await choosePage(document, file.name, 1);
      } else {
        const background = await imageBackground(file);
        setChosen(background);
        onChange(background);
      }
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }

  async function choosePage(document: PDFDocumentProxy, name: string, page: number) {
    setBusy(true);
    setError(undefined);
    try {
      const background = await pdfPageBackground(document, page, name);
      setChosen(background);
      onChange(background);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }

  const pageCount = pdf?.document.numPages ?? 0;
  const lastPage = Math.min(pageCount, firstPage + THUMBNAILS_PER_VIEW - 1);

  return (
    <div className="space-y-3">
      <Field
        label="Fond du plan"
        htmlFor={id}
        error={error}
        hint="Image PNG, JPEG ou WebP, ou PDF (la page choisie est convertie en image). Le fichier est contrôlé avant affichage."
      >
        <Input
          id={id}
          type="file"
          accept={ACCEPT}
          className="h-auto py-2 text-sm"
          onChange={(event) => void select(event.target.files?.[0] ?? null)}
        />
      </Field>
      {pdf && pageCount > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">
            Page à importer ({pageCount} pages{pageCount > THUMBNAILS_PER_VIEW ? ` · ${firstPage}–${lastPage}` : ''})
          </legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: lastPage - firstPage + 1 }, (_, index) => firstPage + index).map((page) => (
              <button
                key={page}
                type="button"
                disabled={busy}
                aria-pressed={chosen?.pageNumber === page}
                onClick={() => void choosePage(pdf.document, pdf.name, page)}
                className={cn(
                  'rounded-md border p-1 text-xs',
                  chosen?.pageNumber === page
                    ? 'border-brand-accent ring-2 ring-brand-accent'
                    : 'border-border hover:bg-subtle',
                )}
              >
                {thumbnails[page] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview rendered by pdf.js
                  <img src={thumbnails[page]} alt="" className="mx-auto max-h-28" />
                ) : (
                  <span className="block h-20" />
                )}
                Page {page}
              </button>
            ))}
          </div>
          {pageCount > THUMBNAILS_PER_VIEW ? (
            <div className="mt-2 flex gap-2 text-sm">
              <button
                type="button"
                className="text-info disabled:text-muted"
                disabled={firstPage === 1}
                onClick={() => setFirstPage((page) => Math.max(1, page - THUMBNAILS_PER_VIEW))}
              >
                Pages précédentes
              </button>
              <button
                type="button"
                className="text-info disabled:text-muted"
                disabled={lastPage >= pageCount}
                onClick={() => setFirstPage((page) => page + THUMBNAILS_PER_VIEW)}
              >
                Pages suivantes
              </button>
            </div>
          ) : null}
        </fieldset>
      ) : null}
      <p className="text-sm text-muted" aria-live="polite">
        {busy
          ? 'Préparation du fond…'
          : chosen
            ? `Fond prêt : ${chosen.width} × ${chosen.height} px${pdf ? ` (page ${chosen.pageNumber})` : ''}.`
            : null}
      </p>
    </div>
  );
}
