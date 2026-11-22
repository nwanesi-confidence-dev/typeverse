export interface TexturePrepStatus {
  preparing: boolean;
  progressPct: number;
  label: string;
}

let currentStatus: TexturePrepStatus = {
  preparing: false,
  progressPct: 100,
  label: 'Ready',
};

const listeners = new Set<(status: TexturePrepStatus) => void>();

export function getTexturePrepStatus(): TexturePrepStatus {
  return currentStatus;
}

export function publishTexturePrepStatus(next: TexturePrepStatus): void {
  currentStatus = next;
  listeners.forEach((fn) => fn(next));
}

export function subscribeTexturePrepStatus(
  fn: (status: TexturePrepStatus) => void,
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
