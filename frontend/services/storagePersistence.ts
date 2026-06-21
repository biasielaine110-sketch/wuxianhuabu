let requested = false;

export async function requestPersistentCanvasStorage(): Promise<boolean | null> {
  if (requested || typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return null;
  }
  requested = true;
  try {
    const alreadyPersisted = await navigator.storage.persisted?.();
    if (alreadyPersisted) return true;
    return await navigator.storage.persist();
  } catch (e) {
    console.warn('[storagePersistence] request persistent storage failed', e);
    return false;
  }
}
