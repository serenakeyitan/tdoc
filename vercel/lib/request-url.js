// Rebuild the ORIGINAL request URL behind the vercel.json catch-all rewrite.
//
// vercel.json rewrites `/(.*)` → `/api/tdoc?__path=$1`, because a Vercel
// project routes by filesystem and the worker routes by pathname — without
// the rewrite every path except /api/tdoc would 404 before our code runs.
// Vercel merges the source URL's own query params into the destination, so
// the function sees `/api/tdoc?__path=d/my-doc/v/2&foo=bar` and must undo the
// mangling before handing the request to the worker's router.
//
// Host/proto come from the x-forwarded-* headers when present: req.url inside
// a function can carry an internal host, and the worker's redirect/cookie
// behavior should be computed against the public origin.
function originalRequestUrl(req) {
  const u = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') || u.host;
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const path = u.searchParams.get('__path');
  if (path == null) {
    // Not rewritten (direct hit on a real path) — just normalize the origin.
    return `${proto}://${host}${u.pathname}${u.search}`;
  }
  u.searchParams.delete('__path');
  const qs = u.searchParams.toString();
  return `${proto}://${host}/${path.replace(/^\/+/, '')}${qs ? `?${qs}` : ''}`;
}

export { originalRequestUrl };
