import { AsyncLocalStorage } from 'async_hooks';

export type RequestMeta = { ip?: string; userAgent?: string };

export const requestContext = new AsyncLocalStorage<RequestMeta>();

export function currentRequestMeta(): RequestMeta {
  return requestContext.getStore() || {};
}
