/** Email callbacks may only return to the two account pages we own. */
export function authDestination(value: string | null): '/admin' | '/set-password' {
  return value === '/set-password' ? '/set-password' : '/admin';
}
