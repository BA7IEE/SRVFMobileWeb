// Only the random identity generation is shared between tabs. It cannot authenticate a request.
export interface SessionGeneration {
  read(): Promise<string>;
  write(marker: string): Promise<void>;
  onChange(notify: () => void): void;
}

export function browserGeneration(): SessionGeneration {
  let opened: Promise<IDBDatabase> | undefined;
  let channel: BroadcastChannel | undefined;
  function db() {
    if (!opened) {
      opened = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('srvf-h5-session-generation', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('generation');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch((error: unknown) => {
        opened = undefined;
        throw error;
      });
    }
    return opened;
  }
  return {
    async read() {
      const database = await db();
      return new Promise<string>((resolve, reject) => {
        const req = database.transaction('generation').objectStore('generation').get('current');
        req.onsuccess = () => resolve(req.result ?? '');
        req.onerror = () => reject(req.error);
      });
    },
    async write(marker) {
      const database = await db();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('generation', 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        tx.objectStore('generation').put(marker, 'current');
      });
      channel?.postMessage('changed');
    },
    onChange(notify) {
      if (typeof BroadcastChannel === 'undefined') return;
      channel = new BroadcastChannel('srvf-h5-generation');
      channel.onmessage = notify;
    },
  };
}
