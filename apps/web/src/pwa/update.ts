/** Page-side service worker update flow. A new worker waits until the user accepts; only then does the page
 *  send SKIP_WAITING, and the page reloads once the new worker takes control. Nothing here touches the network. */

export interface WorkerLike {
  state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', listener: () => void): void;
}

export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  addEventListener(type: 'updatefound', listener: () => void): void;
}

export interface ContainerLike {
  controller: unknown;
  addEventListener(type: 'controllerchange', listener: () => void): void;
}

export interface UpdateController {
  /** Start watching a registration. Safe to call more than once. */
  track(registration: RegistrationLike, container: ContainerLike): void;
  /** True while an update is waiting and the user has not dismissed the prompt. */
  getSnapshot(): boolean;
  subscribe(listener: () => void): () => void;
  /** User accepted: ask the waiting worker to activate; the page reloads once it controls the page. */
  accept(): void;
  /** User chose "later": hide the prompt until the next page load. */
  dismiss(): void;
}

export function createUpdateController(reload: () => void = () => window.location.reload()): UpdateController {
  let waiting: WorkerLike | null = null;
  let dismissed = false;
  let accepted = false;
  let reloaded = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const setWaiting = (w: WorkerLike) => {
    if (waiting === w) return;
    waiting = w;
    dismissed = false;
    emit();
  };
  const seen = new WeakSet<object>();

  return {
    track(registration, container) {
      if (seen.has(registration)) return;
      seen.add(registration);
      // controllerchange also fires on the very first install (clients.claim), so reload only after acceptance.
      container.addEventListener('controllerchange', () => {
        if (accepted && !reloaded) {
          reloaded = true;
          reload();
        }
      });
      // An update only counts when a worker already controls this page; on first install there is nothing to update.
      if (registration.waiting && container.controller) setWaiting(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const next = registration.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          if (next.state === 'installed' && container.controller) setWaiting(next);
        });
      });
    },
    getSnapshot: () => waiting !== null && !dismissed,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    accept() {
      if (!waiting) return;
      accepted = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
    },
    dismiss() {
      if (dismissed) return;
      dismissed = true;
      emit();
    },
  };
}

/** The app-wide controller used by register.ts and the UpdatePrompt component. */
export const updateController: UpdateController = createUpdateController();
