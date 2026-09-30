'use client';

import { MAX_PLAN_SIDE_PX } from '@etare/domain';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ApiRequestError } from './api-client';

/** Resolution of a plan rendered from a PDF (enough to read labels on a tablet), capped in pixels. */
const PDF_RENDER_DPI = 200;
const PDF_MAX_SIDE_PX = 6000;
const PDF_WORKER_URL = '/pdfjs/pdf.worker.min.mjs';

export interface PlanBackground {
  readonly file: File;
  readonly width: number;
  readonly height: number;
  readonly pageNumber: number;
}

const refused = (message: string) => new ApiRequestError(400, 'VALIDATION_FAILED', message, null);

/** Size in pixels of an image file (read by the browser, never trusted from the file name). */
export async function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw refused('Image illisible : utilisez un fichier PNG, JPEG ou WebP.');
  }
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/** An image used as it is: its size is checked here, its content by the worker. */
export async function imageBackground(file: File): Promise<PlanBackground> {
  const { width, height } = await imageSize(file);
  if (Math.max(width, height) > MAX_PLAN_SIDE_PX) {
    throw refused(`Image trop grande (${MAX_PLAN_SIDE_PX} px par côté au plus) : réduisez-la avant l’import.`);
  }
  return { file, width, height, pageNumber: 1 };
}

/** Opens a PDF in the browser (pdf.js, worker served from the same origin). */
export async function openPdf(file: File): Promise<PDFDocumentProxy> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  try {
    return await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch {
    throw refused('PDF illisible ou protégé par mot de passe.');
  }
}

async function renderPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scaleFor: (width: number, height: number) => number,
) {
  const page = await pdf.getPage(pageNumber);
  const natural = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: scaleFor(natural.width, natural.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw refused('Rendu du PDF impossible dans ce navigateur.');
  // White paper: transparent areas of the PDF must not become black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  page.cleanup();
  return canvas;
}

/** Small preview of a page, to choose the one to import. */
export async function pdfThumbnail(pdf: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const canvas = await renderPage(pdf, pageNumber, (width, height) => 220 / Math.max(width, height));
  return canvas.toDataURL('image/png');
}

/**
 * Renders one page of a PDF as the PNG background of a plan (200 dpi, 6 000 px
 * at most per side). The PNG is what the SIS checks, validates and publishes.
 */
export async function pdfPageBackground(pdf: PDFDocumentProxy, pageNumber: number, sourceName: string) {
  const canvas = await renderPage(pdf, pageNumber, (width, height) =>
    Math.min(PDF_RENDER_DPI / 72, PDF_MAX_SIDE_PX / Math.max(width, height)),
  );
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw refused('Conversion de la page en image impossible.');
  const name = `${sourceName.replace(/\.pdf$/i, '')}-page-${pageNumber}.png`;
  return {
    file: new File([blob], name, { type: 'image/png' }),
    width: canvas.width,
    height: canvas.height,
    pageNumber,
  } satisfies PlanBackground;
}
