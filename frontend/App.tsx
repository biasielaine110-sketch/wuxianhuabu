import React, { lazy, Suspense, useState } from 'react';
import { HomeScreen } from './components/HomeScreen';

const CanvasApp = lazy(() =>
  import('./CanvasApp').then((m) => ({ default: m.CanvasApp }))
);

function CanvasLoadingFallback() {
  return (
    <div className="w-screen h-screen bg-[#0f0f0f] flex items-center justify-center text-gray-400 text-sm">
      加载画布…
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<'home' | 'canvas'>('home');

  if (screen === 'home') {
    return <HomeScreen onEnterCanvas={() => setScreen('canvas')} />;
  }

  return (
    <Suspense fallback={<CanvasLoadingFallback />}>
      <CanvasApp onBackToHome={() => setScreen('home')} />
    </Suspense>
  );
}
