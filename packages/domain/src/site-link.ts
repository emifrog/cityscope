/**
 * Link of a site, carried by the QR code printed on the ETARE PDF and shown in the
 * back-office. It names the site only: no secret, no right of access (architecture §16).
 * A phone opens the back-office page; the OPS application reads the site identifier
 * and opens the version installed on the tablet.
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** http(s), any host, the path of the site page, an optional query or fragment. */
const SITE_LINK = new RegExp(`^https?://[^/?#\\s]+/sites/(${UUID})/?(?:[?#]\\S*)?$`, 'i');

/** `https://<base>/sites/<id>`: the page of the site in the back-office. */
export function siteLink(baseUrl: string, siteId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/sites/${siteId}`;
}

/** Site identifier of a scanned text: null when it is not a site link. */
export function siteIdOfLink(text: string): string | null {
  return SITE_LINK.exec(text.trim())?.[1]?.toLowerCase() ?? null;
}
