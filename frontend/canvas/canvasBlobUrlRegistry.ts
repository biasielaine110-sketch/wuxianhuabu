const blobUrlRegistry = new Map<string, Set<string>>();

export function registerNodeBlobUrl(nodeId: string, url: string): void {
  let urls = blobUrlRegistry.get(nodeId);
  if (!urls) {
    urls = new Set();
    blobUrlRegistry.set(nodeId, urls);
  }
  urls.add(url);
}

/** 节点删除时调用，回收该节点所有 blob URL */
export function revokeNodeBlobUrls(nodeId: string): void {
  const urls = blobUrlRegistry.get(nodeId);
  if (!urls) return;
  urls.forEach((url) => URL.revokeObjectURL(url));
  blobUrlRegistry.delete(nodeId);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    blobUrlRegistry.forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)));
    blobUrlRegistry.clear();
  });
}
