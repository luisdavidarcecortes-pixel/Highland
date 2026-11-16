/**
 * Cookie policy shared by the browser and the server Supabase clients.
 *
 * Why the cookie is not httpOnly: the browser uploads the issue PDF straight
 * to Supabase Storage (a serverless host cuts request bodies at 4.5 MB, so a
 * 44 MB issue cannot travel through this app) and the resumable upload needs
 * the member's access token in the browser. The token comes from this cookie,
 * so the cookie has to stay readable by JavaScript.
 *
 * What is done about it instead:
 *   * `secure` as soon as the site runs over HTTPS,
 *   * `sameSite: lax`, so it does not travel with third party requests,
 *   * a short lifetime: the session is refreshed while the member works, and
 *     a stolen cookie is worthless after a week of inactivity,
 *   * a strict Content Security Policy, which is what limits the damage an
 *     XSS could do with a readable cookie.
 *
 * Making it httpOnly is possible the day the uploads stop using the member's
 * token in the browser (signed upload URLs or chunked uploads through a route
 * handler).
 */
export const sessionCookieOptions = {
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  // Seven days. The client refreshes the session while the member works.
  maxAge: 60 * 60 * 24 * 7,
};
