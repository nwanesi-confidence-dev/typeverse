import type {RegisterSWOptions} from 'vite-plugin-pwa/types';

export type {RegisterSWOptions};

export function registerSW(
  _options?: RegisterSWOptions,
): (reloadPage?: boolean) => Promise<void> {
  return async () => {};
}
