/** Opens a short-lived signed URL in a new tab (no opener, no referrer). */
export function openInNewTab(url: string): void {
  const link = window.document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.click();
}
