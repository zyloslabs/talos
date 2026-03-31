/**
 * Proxy preload script — loaded via NODE_OPTIONS="--import=<this-file>"
 * in Copilot SDK child processes. Sets an undici EnvHttpProxyAgent as the
 * global fetch() dispatcher so Node 22's native fetch honours HTTP(S)_PROXY.
 */
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}
