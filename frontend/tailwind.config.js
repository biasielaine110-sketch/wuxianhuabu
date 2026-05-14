/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './**/*.{ts,tsx}', './services/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
  safelist: [
    // 高端科技感生成按钮样式
    'gen-btn-holo',
    'gen-btn-generating',
    'gen-btn-video-core',
    'gen-btn-cancel',
    'gen-btn-cancel-video',
    'gen-progress-orb',
    'gen-progress-orb-ring',
    'gen-progress-orb-core',
    'gen-text-holo',
    'gen-text-glitch',
    'gen-text-glitch-amber',
    'gen-btn-cyber-corner',
    'holo-particles',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
    'video',
  ],
};
