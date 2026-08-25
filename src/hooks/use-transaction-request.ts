import { useCallback, useRef } from "react";

export function useTransactionRequest() {
  const requestIds = useRef(new Map<string, string>());

  const getRequestId = useCallback((operation: string) => {
    const current = requestIds.current.get(operation);
    if (current) return current;

    const requestId = crypto.randomUUID();
    requestIds.current.set(operation, requestId);
    return requestId;
  }, []);

  const resetRequestId = useCallback((operation: string) => {
    requestIds.current.delete(operation);
  }, []);

  return { getRequestId, resetRequestId };
}
