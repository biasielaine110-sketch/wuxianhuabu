import React, { useEffect, useState } from 'react';

export function useGenerationElapsed(startedAt: number): { mmSs: string; seconds: number } {
  const [seconds, setSeconds] = useState(() =>
    Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  );

  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const mmSs = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return { mmSs, seconds };
}

type GenerationTimerProps = {
  startedAt: number;
  className?: string;
  showSeconds?: boolean;
  prefix?: string;
  glitch?: false | 'purple' | 'amber';
  secondsClassName?: string;
};

/** 局部计时器：仅自身 re-render，不触发 App 全局刷新 */
export function GenerationTimer({
  startedAt,
  className = 'tabular-nums text-[11px] opacity-90',
  showSeconds = false,
  prefix,
  glitch = false,
  secondsClassName = 'text-[10px] opacity-75',
}: GenerationTimerProps) {
  const { mmSs, seconds } = useGenerationElapsed(startedAt);

  const glitchClass =
    glitch === 'amber' ? 'gen-text-glitch-amber' : glitch ? 'gen-text-glitch' : '';

  return (
    <span className="inline-flex items-center gap-1">
      {prefix ? <span>{prefix}</span> : null}
      <span className={`${glitchClass} ${className}`.trim()} data-text={glitch ? mmSs : undefined}>
        {mmSs}
      </span>
      {showSeconds ? <span className={secondsClassName}>({seconds}s)</span> : null}
    </span>
  );
}
