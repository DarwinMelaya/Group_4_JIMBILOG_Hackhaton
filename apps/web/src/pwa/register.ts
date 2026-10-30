import { updateController } from './update';

/** Normalises a Vite BASE_URL to a root-relative path that starts and ends with '/'. Anything else falls back to '/'. */
export function normalizeBase(base: string | undefined): string {
  if (!base || !base.startsWith('/')) return '/';
  return base.endsWith('/') ? base : `${base}/`;
}

export interface RegisterOptions {
  /** Defaults to import.meta.env.PROD: the worker is never registered in dev or tests. */
  prod?: boolean;
  /** Defaults to import.meta.env.BASE_URL. */
  base?: string;
  /** Test seams; default to the real browser objects. */
  container?: Pick<ServiceWorkerContainer, 'register' | 'controller' | 'addEventListener'>;
  doc?: Pick<Document, 'readyState'>;
  win?: Pick<Window, 'addEventListener'>;
}

/** Registers the service worker in production builds only, AFTER the window load event so it never competes with
 *  first render. The script and scope follow the deploy base. Never throws; resolves null when not registered. */
export function registerServiceWorker(opts: RegisterOptions = {}): Promise<ServiceWorkerRegistration | null> {
  const prod = opts.prod ?? import.meta.env.PROD;
  if (!prod) return Promise.resolve(null);
  const container =
    opts.container ?? (typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined);
  if (!container) return Promise.resolve(null);
  const doc = opts.doc ?? (typeof document !== 'undefined' ? document : undefined);
  const win = opts.win ?? (typeof window !== 'undefined' ? window : undefined);
  if (!doc || !win) return Promise.resolve(null);
  const base = normalizeBase(opts.base ?? import.meta.env.BASE_URL);

  const register = async (): Promise<ServiceWorkerRegistration | null> => {
    try {
      const registration = await container.register(`${base}sw.js`, { scope: base });
      updateController.track(registration, container);
      return registration;
    } catch {
      return null;
    }
  };

  if (doc.readyState === 'complete') return register();
  return new Promise((resolve) => {
    win.addEventListener('load', () => void register().then(resolve), { once: true });
  });
}
