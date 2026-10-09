'use client';

import { siteLink } from '@etare/domain';
import qrcode from 'qrcode-generator';
import { useMemo, useSyncExternalStore } from 'react';

const noSubscription = () => () => {};
/** The public address is the one of the browser; unknown while rendering on the server. */
const useOrigin = () =>
  useSyncExternalStore(
    noSubscription,
    () => window.location.origin,
    () => null,
  );

/**
 * QR code of a site: the same link as the one printed on the ETARE PDF, under the address of this
 * back-office. It names the site only (no secret, no right of access); the OPS application opens the
 * version installed on the tablet, a phone opens this page.
 */
export function SiteQrCode({ siteId, size = 128 }: { siteId: string; size?: number }) {
  const origin = useOrigin();
  const link = origin ? siteLink(origin, siteId) : null;
  const modules = useMemo(() => {
    if (!link) return null;
    const code = qrcode(0, 'M');
    code.addData(link);
    code.make();
    const count = code.getModuleCount();
    const dark: string[] = [];
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (code.isDark(row, column)) dark.push(`M${column + 4} ${row + 4}h1v1h-1z`);
      }
    }
    return { count, path: dark.join('') };
  }, [link]);
  if (!link || !modules) return <div style={{ width: size, height: size }} aria-hidden />;
  const side = modules.count + 8;
  return (
    <figure className="flex flex-col items-start gap-2">
      <svg
        role="img"
        aria-label={`Code QR du site : ${link}`}
        viewBox={`0 0 ${side} ${side}`}
        width={size}
        height={size}
        shapeRendering="crispEdges"
        className="rounded border border-border bg-white"
      >
        <path d={modules.path} fill="#0f172a" />
      </svg>
      <figcaption className="font-mono text-xs break-all text-muted">{link}</figcaption>
    </figure>
  );
}
