import React, { memo } from 'react';
import { NodePlaceholder } from './NodePlaceholder';
import type { NodePlaceholderProps } from './NodePlaceholder';

export const MemoizedNodePlaceholder = memo(
  function MemoizedNodePlaceholder(props: NodePlaceholderProps) {
    return <NodePlaceholder {...props} />;
  },
  (prev, next) =>
    prev.node === next.node &&
    prev.isSelected === next.isSelected &&
    prev.hint === next.hint &&
    prev.hasInputPort === next.hasInputPort &&
    prev.hasOutputPort === next.hasOutputPort
);
