import type { SupabaseClient } from "@supabase/supabase-js";

const STORAGE_KEY = "biotrack:offline-rpc:v1";

export type OfflineRpcItem = {
  id: string;
  rpc: string;
  args: Record<string, unknown>;
  createdAt: string;
};

export function readOfflineQueue(): OfflineRpcItem[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeOfflineQueue(queue: OfflineRpcItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event("biotrack:offline-queue"));
}

export function enqueueOfflineRpc(rpc: string, args: Record<string, unknown>) {
  const queue = readOfflineQueue();
  const requestId = String(args._request_id ?? crypto.randomUUID());
  if (!queue.some((item) => item.id === requestId)) {
    queue.push({ id: requestId, rpc, args, createdAt: new Date().toISOString() });
    writeOfflineQueue(queue);
  }
}

export async function flushOfflineQueue(client: SupabaseClient) {
  const queue = readOfflineQueue();
  let completed = 0;
  for (const item of queue) {
    const { error } = await client.rpc(item.rpc, item.args);
    if (error) return { completed, pending: queue.length - completed, error };
    completed += 1;
    writeOfflineQueue(queue.slice(completed));
  }
  return { completed, pending: 0, error: null };
}
