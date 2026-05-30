import type { CanvasNode } from '../types';
import { getCanvasAssetRecord, putCanvasAssetRecord } from './canvasAssetStore';

const ASSETS_DIR = 'assets';
const ASSETS_MANIFEST = 'assets/manifest.json';

export type ProjectAssetManifest = Record<
  string,
  { mime: string; file: string; byteSize?: number }
>;

/** 从项目节点收集所有 IDB 资产 id */
export function collectProjectAssetIds(nodes: CanvasNode[]): string[] {
  const ids = new Set<string>();
  const add = (id?: string) => {
    if (id) ids.add(id);
  };
  for (const n of nodes) {
    n.imageAssetIds?.forEach(add);
    add((n as { panoramaImageAssetId?: string }).panoramaImageAssetId);
    add((n as { sourceImageAssetId?: string }).sourceImageAssetId);
    add((n as { backgroundImageAssetId?: string }).backgroundImageAssetId);
    add((n as { inputImageAssetId?: string }).inputImageAssetId);
    add((n as { outputImageAssetId?: string }).outputImageAssetId);
    (n as { outputImageAssetIds?: string[] }).outputImageAssetIds?.forEach(add);
    (n as { inputImageAssetIds?: string[] }).inputImageAssetIds?.forEach(add);
  }
  return [...ids];
}

/** @deprecated */
export function collectProjectImageAssetIds(nodes: CanvasNode[]): string[] {
  return collectProjectAssetIds(nodes);
}

/** 将 IDB 资产写入 ZIP（assets/manifest.json + assets/*.bin） */
export async function embedProjectAssetsInZip(
  zip: { file: (path: string, data: Blob | string) => void },
  nodes: CanvasNode[]
): Promise<number> {
  const ids = collectProjectAssetIds(nodes);
  const manifest: ProjectAssetManifest = {};
  let count = 0;

  for (const id of ids) {
    const record = await getCanvasAssetRecord(id);
    if (!record) continue;
    const ext = record.mime.includes('png')
      ? 'png'
      : record.mime.includes('webp')
        ? 'webp'
        : record.mime.includes('gif')
          ? 'gif'
          : 'jpg';
    const file = `${ASSETS_DIR}/${id}.${ext}`;
    zip.file(file, record.blob);
    manifest[id] = { mime: record.mime, file, byteSize: record.byteSize };
    count++;
  }

  if (count > 0) {
    zip.file(ASSETS_MANIFEST, JSON.stringify(manifest, null, 2));
  }
  return count;
}

/** 从 ZIP 恢复资产到 IDB（保留原 assetId） */
export async function hydrateProjectAssetsFromZip(zip: {
  file: (path: string) => { async: (type: string) => Promise<unknown> } | null;
}): Promise<number> {
  const manifestFile = zip.file(ASSETS_MANIFEST);
  if (!manifestFile) return 0;

  const manifest = JSON.parse(
    (await manifestFile.async('string')) as string
  ) as ProjectAssetManifest;

  let count = 0;
  for (const [id, meta] of Object.entries(manifest)) {
    const assetFile = zip.file(meta.file);
    if (!assetFile) continue;
    const blob = (await assetFile.async('blob')) as Blob;
    await putCanvasAssetRecord(id, blob, meta.mime);
    count++;
  }
  return count;
}
