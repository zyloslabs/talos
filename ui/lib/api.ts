export const testProxyConnection = () =>
  fetchApi<{ connected: boolean; latencyMs?: number; error?: string }>("/api/admin/proxy/test", { method: "POST" });
