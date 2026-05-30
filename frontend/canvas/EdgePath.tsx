import React, { useRef, useState } from 'react';
// 连线组件 - 支持点击删除和长按拖拽取消
export interface EdgePathProps {
  edgeId: string;
  startX: number;
  startY: number;
  cp1X: number;
  cp1Y: number;
  cp2X: number;
  cp2Y: number;
  endX: number;
  endY: number;
  isActive: boolean;
  onDelete: (id: string) => void;
}

export function EdgePath({ edgeId, startX, startY, cp1X, cp1Y, cp2X, cp2Y, endX, endY, isActive, onDelete }: EdgePathProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isNearStart, setIsNearStart] = useState(false);
  const [isNearEnd, setIsNearEnd] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();

    // 检查是否靠近起点或终点
    const rect = (e.target as SVGElement).ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;

    // 计算鼠标在 SVG 坐标系中的位置
    const svg = (e.target as SVGElement).ownerSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    // 检查是否靠近起点或终点
    const nearStart = Math.hypot(svgP.x - startX, svgP.y - startY) < 20;
    const nearEnd = Math.hypot(svgP.x - endX, svgP.y - endY) < 20;
    setIsNearStart(nearStart);
    setIsNearEnd(nearEnd);

    // 长按计时器
    longPressTimerRef.current = window.setTimeout(() => {
      setIsDragging(true);
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    }, 300);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;

    const svg = (e.target as SVGElement).ownerSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    // 拖拽时动态更新终点位置（通过状态传递）
    // 这里我们发送一个自定义事件来更新
    window.dispatchEvent(new CustomEvent('edge-drag', {
      detail: { edgeId, x: svgP.x, y: svgP.y, nearStart: isNearStart, nearEnd: isNearEnd }
    }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (isDragging) {
      setIsDragging(false);
      // 拖拽结束时，检查是否远离了节点，如果是则删除连线
      const svg = (e.target as SVGElement).ownerSVGElement;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

      // 如果拖拽到了远离节点的位置，删除连线
      if (isNearStart) {
        const distFromStart = Math.hypot(svgP.x - startX, svgP.y - startY);
        if (distFromStart > 100) {
          onDelete(edgeId);
        }
      } else if (isNearEnd) {
        const distFromEnd = Math.hypot(svgP.x - endX, svgP.y - endY);
        if (distFromEnd > 100) {
          onDelete(edgeId);
        }
      }

      // 重置连线位置
      window.dispatchEvent(new CustomEvent('edge-drag-end', { detail: { edgeId } }));
    }
  };

  return (
    <>
      {/* 可见的连线 */}
      <path
        d={`M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`}
        stroke={isActive ? "#60a5fa" : "#4a5568"}
        strokeWidth={isActive ? "3" : "2"}
        fill="none"
        markerEnd={isActive ? "url(#arrowhead-active)" : "url(#arrowhead)"}
        filter={isActive ? "url(#glow-active)" : undefined}
        opacity={isActive ? 1 : 0.7}
        className={`transition-all duration-200 ${isDragging ? 'stroke-red-400' : isActive ? '' : 'hover:stroke-red-400'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ cursor: 'pointer' }}
      />
      {/* 不可见的宽线用于检测 */}
      <path
        d={`M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`}
        stroke="transparent"
        strokeWidth="16"
        fill="none"
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => onDelete(edgeId)}
      />
    </>
  );
}
