export async function runWithConcurrency<T>(
  values: readonly T[],
  limit: number,
  task: (value: T) => Promise<void>,
) {
  if (!values.length) return;

  let nextIndex = 0;
  const workerCount = Math.min(
    values.length,
    Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 1)),
  );

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      await task(values[index]!);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
