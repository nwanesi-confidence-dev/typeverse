export interface SystemToast {
  id: string;
  title: string;
  message: string;
  tone: 'info' | 'warning';
}

type ToastListener = (toast: SystemToast) => void;
const listeners = new Set<ToastListener>();
let seq = 0;

export function subscribeSystemToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSystemToast(
  title: string,
  message: string,
  tone: 'info' | 'warning' = 'info',
): void {
  const toast: SystemToast = {
    id: `sys-${Date.now()}-${++seq}`,
    title,
    message,
    tone,
  };
  listeners.forEach((fn) => fn(toast));
}
