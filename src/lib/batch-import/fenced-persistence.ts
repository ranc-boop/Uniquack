export const FENCED_IMPORT_ITEM_RPC_MAX_ATTEMPTS = 2;

type FencedImportRpcResult<TData, TError> = {
  data: TData;
  error: TError | null;
};

export async function runFencedImportItemRpcWithReplay<
  TData,
  TError extends { message?: string },
>(
  operation: () => Promise<FencedImportRpcResult<TData, TError>>,
) {
  let lastResult: FencedImportRpcResult<TData, TError> | null = null;
  let lastThrown: unknown;

  for (
    let attempt = 1;
    attempt <= FENCED_IMPORT_ITEM_RPC_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const result = await operation();
      if (!result.error) return result;
      lastResult = result;
      lastThrown = undefined;
    } catch (error) {
      lastResult = null;
      lastThrown = error;
    }
  }

  if (lastResult) return lastResult;
  throw lastThrown;
}
