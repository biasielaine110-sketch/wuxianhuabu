const blobUrlRegistry = new Map<string, Set<string>>();

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
