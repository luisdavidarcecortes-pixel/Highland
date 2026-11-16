/** Bound SDK operations, including their internal retry loops. */
export async function withDeadline<T>(operation: Promise<T>, milliseconds = 6000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Account service deadline exceeded')), milliseconds);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
