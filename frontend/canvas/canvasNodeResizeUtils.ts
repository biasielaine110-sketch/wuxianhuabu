/** 用指针画布坐标算节点矩形；手柄带 translate(±50%)，抓取点往往在角/边外侧，须用按下时的 grab 与几何参考点的差值修正，否则四角起手会跳。 */
export function computeNodeResizeFromPointer(
  origin: { x: number; y: number; width: number; height: number },
  direction: string,
  px: number,
  py: number,
  grabPx: number,
  grabPy: number,
  shiftKey: boolean,
  minWidth: number,
  minHeight: number,
): { x: number; y: number; width: number; height: number } {
  const ox = origin.x;
  const oy = origin.y;
  const right = ox + origin.width;
  const bottom = oy + origin.height;

  let newX = ox;
  let newY = oy;
  let newW = origin.width;
  let newH = origin.height;

  if (direction === 'e') {
    const edgeX = px - (grabPx - right);
    newW = Math.max(minWidth, edgeX - ox);
    newX = ox;
    newY = oy;
    newH = origin.height;
  } else if (direction === 'w') {
    const edgeX = px - (grabPx - ox);
    newW = Math.max(minWidth, right - edgeX);
    newX = right - newW;
    newY = oy;
    newH = origin.height;
  } else if (direction === 's') {
    const edgeY = py - (grabPy - bottom);
    newH = Math.max(minHeight, edgeY - oy);
    newX = ox;
    newY = oy;
    newW = origin.width;
  } else if (direction === 'n') {
    const edgeY = py - (grabPy - oy);
    newH = Math.max(minHeight, bottom - edgeY);
    newY = bottom - newH;
    newX = ox;
    newW = origin.width;
  } else if (direction === 'se') {
    newX = ox;
    newY = oy;
    const cx = px - (grabPx - right);
    const cy = py - (grabPy - bottom);
    const tw = cx - ox;
    const th = cy - oy;
    if (shiftKey) {
      const ratio = origin.width / origin.height;
      if (tw > 0 && th > 0) {
        if (tw / th > ratio) {
          newW = Math.max(minWidth, th * ratio);
          newH = Math.max(minHeight, th);
        } else {
          newW = Math.max(minWidth, tw);
          newH = Math.max(minHeight, tw / ratio);
        }
      } else {
        newW = minWidth;
        newH = minHeight;
      }
    } else {
      newW = Math.max(minWidth, tw);
      newH = Math.max(minHeight, th);
    }
  } else if (direction === 'sw') {
    newY = oy;
    const cx = px - (grabPx - ox);
    const cy = py - (grabPy - bottom);
    newW = Math.max(minWidth, right - cx);
    newX = right - newW;
    newH = Math.max(minHeight, cy - oy);
  } else if (direction === 'ne') {
    newX = ox;
    const cx = px - (grabPx - right);
    const cy = py - (grabPy - oy);
    newW = Math.max(minWidth, cx - ox);
    newH = Math.max(minHeight, bottom - cy);
    newY = bottom - newH;
  } else if (direction === 'nw') {
    const cx = px - (grabPx - ox);
    const cy = py - (grabPy - oy);
    newW = Math.max(minWidth, right - cx);
    newH = Math.max(minHeight, bottom - cy);
    newX = right - newW;
    newY = bottom - newH;
  }

  return { x: newX, y: newY, width: newW, height: newH };
}
