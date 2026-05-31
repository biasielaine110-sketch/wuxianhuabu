import React from 'react';
import type { NodeType } from '../types';

export type NodeHeaderMeta = {
  headerIcon: React.ReactNode;
  headerTitle: string;
  borderColor: string;
  shadowColor: string;
};

const ImageIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

export function getNodeHeaderMeta(type: NodeType | string, isSelected: boolean): NodeHeaderMeta {
  switch (type) {
    case 'text':
      return {
        headerIcon: <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" x2="15" y1="20" y2="20" /><line x1="12" x2="12" y1="4" y2="20" /></svg>,
        headerTitle: '文本节点',
        borderColor: isSelected ? 'border-gray-400' : 'border-[#333]',
        shadowColor: isSelected ? 'shadow-gray-500/20' : '',
      };
    case 'image':
      return {
        headerIcon: <ImageIcon className="text-green-400" />,
        headerTitle: '图片节点',
        borderColor: isSelected ? 'border-green-500' : 'border-[#333]',
        shadowColor: isSelected ? 'shadow-green-900/30' : '',
      };
    case 't2i':
      return {
        headerIcon: <ImageIcon className="text-purple-400" />,
        headerTitle: '文生图',
        borderColor: isSelected ? 'border-purple-500' : 'border-[#333]',
        shadowColor: isSelected ? 'shadow-purple-900/30' : '',
      };
    case 'panorama':
      return {
        headerIcon: <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
        headerTitle: '360° 全景图',
        borderColor: isSelected ? 'border-cyan-500' : 'border-[#333]',
        shadowColor: isSelected ? 'shadow-cyan-900/30' : '',
      };
    case 'annotation':
      return {
        headerIcon: <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-400"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /><circle cx="13" cy="13" r="3" /></svg>,
        headerTitle: '图片标注',
        borderColor: isSelected ? 'border-orange-500' : 'border-[#333]',
        shadowColor: isSelected ? 'shadow-orange-900/30' : '',
      };
    case 'gridSplit':
      return {
        headerIcon: <svg xmlns="http://www.w3.org/2000/svg" width={21} height={21} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal-400"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
        headerTitle: '宫格拆分',
        borderColor: isSelected ? 'border-teal-500' : 'border-[#333]',
        shadowColor: isSelected ? 'shadow-teal-900/30' : '',
      };
    case 'gridMerge':
      return {
        headerIcon: <svg xmlns="http://www.w3.org/2000/svg" width={21} height={21} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal-400"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="3" y1="14" x2="21" y2="14" /><line x1="10" y1="3" x2="10" y2="21" /><line x1="14" y1="3" x2="14" y2="21" /></svg>,
        headerTitle: '宫格合并',
        borderColor: isSelected ? 'border-teal-500' : 'border-[#333]',
        shadowColor: isSelected ? 'shadow-teal-900/30' : '',
      };
    case 'panoramaT2i':
      return {
        headerIcon: <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400"><rect x="2" y="6" width="20" height="12" rx="2" /><line x1="2" y1="12" x2="22" y2="12" /></svg>,
        headerTitle: '全景图生成',
        borderColor: isSelected ? 'border-indigo-500' : 'border-[#333]',
        shadowColor: isSelected ? 'shadow-indigo-900/30' : '',
      };
    case 'director3d':
      return {
        headerIcon: <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-pink-400"><circle cx="12" cy="8" r="4" /><path d="M12 12v4" /><path d="M8 22l4-6 4 6" /><path d="M7 8l5-4 5 4" /><path d="M17 2l3 3-3 3" /><path d="M20 14h-3" /></svg>,
        headerTitle: '3D导演台',
        borderColor: isSelected ? 'border-pink-500' : 'border-[#333]',
        shadowColor: isSelected ? 'shadow-pink-900/30' : '',
      };
    case 'video':
      return {
        headerIcon: <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>,
        headerTitle: '视频生成',
        borderColor: isSelected ? 'border-amber-500' : 'border-[#333]',
        shadowColor: isSelected ? 'shadow-amber-900/30' : '',
      };
    case 'audio':
      return {
        headerIcon: <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>,
        headerTitle: '语音节点',
        borderColor: isSelected ? 'border-blue-500' : 'border-[#333]',
        shadowColor: isSelected ? 'shadow-blue-900/30' : '',
      };
    case 'chat':
      return {
        headerIcon: <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-rose-400"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
        headerTitle: 'AI对话',
        borderColor: isSelected ? 'border-rose-500' : 'border-[#333]',
        shadowColor: isSelected ? 'shadow-rose-900/30' : '',
      };
    default:
      return {
        headerIcon: <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400"><path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" /><path d="M17.8 11.8 19 13" /><path d="M15 9h.01" /><path d="M17.8 6.2 19 5" /><path d="m3 21 9-9" /><path d="M12.2 6.2 11 5" /></svg>,
        headerTitle: '图生图',
        borderColor: isSelected ? 'border-blue-500' : 'border-[#333]',
        shadowColor: isSelected ? 'shadow-blue-900/30' : '',
      };
  }
}
