import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { operationsDb } from "@/lib/operations-client";
import { enqueueOfflineRpc, flushOfflineQueue, readOfflineQueue } from "@/lib/offline-rpc-queue";

export function useOfflineRpcQueue(onSynced?: () => void | Promise<void>) {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [pending, setPending] = useState(() => readOfflineQueue().length);

  const flush = useCallback(async () => {
    if (!navigator.onLine || readOfflineQueue().length === 0) return;
    const result = await flushOfflineQueue(operationsDb);
    setPending(result.pending);
    if (result.completed > 0) {
      toast.success(`${result.completed} operación(es) offline sincronizadas.`);
      await onSynced?.();
    }
    if (result.error) toast.error("Una operación offline requiere revisión antes de continuar.");
  }, [onSynced]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void flush();
    };
    const handleOffline = () => setOnline(false);
    const handleQueue = () => setPending(readOfflineQueue().length);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("biotrack:offline-queue", handleQueue);
    void flush();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("biotrack:offline-queue", handleQueue);
    };
  }, [flush]);

  const queueRpc = (rpc: string, args: Record<string, unknown>) => {
    enqueueOfflineRpc(rpc, args);
    setPending(readOfflineQueue().length);
  };

  return { online, pending, queueRpc, flush };
}
