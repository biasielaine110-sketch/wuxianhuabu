export type CopyToImageLayout = 'spaced' | 'stacked';

export type CopyToImageOptions = {
  layout?: CopyToImageLayout;
  /** 仅复制当前索引/主图（与生图节点工具栏「复制」一致） */
  primaryOnly?: boolean;
};

export function resolveCopyToImageOptions(
  layoutOrOptions?: CopyToImageLayout | CopyToImageOptions
): Required<Pick<CopyToImageOptions, 'layout'>> & CopyToImageOptions {
  if (typeof layoutOrOptions === 'string') {
    return { layout: layoutOrOptions };
  }
  return { layout: 'spaced', ...layoutOrOptions };
}
