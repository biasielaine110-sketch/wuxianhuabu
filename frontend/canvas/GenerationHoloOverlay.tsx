import React from 'react';

/** 文生图 / 图生图节点生成中的全息扫描动效 */
export function GenerationHoloOverlay() {
  return (
    <div
      className="absolute inset-0 z-[3] pointer-events-none"
      style={{
        background:
          'radial-gradient(ellipse at 50% 30%, rgba(0,245,255,0.15) 0%, rgba(102,126,234,0.10) 30%, rgba(168,85,247,0.08) 60%, transparent 80%)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0,245,255,0.03) 2px,
              rgba(0,245,255,0.03) 4px
            )
          `,
          animation: 'hologramScan 0.5s linear infinite',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: '4px',
          background:
            'linear-gradient(90deg, transparent 0%, rgba(0,245,255,0.3) 10%, rgba(0,245,255,0.9) 50%, rgba(0,245,255,0.3) 90%, transparent 100%)',
          boxShadow: '0 0 20px rgba(0,245,255,0.8), 0 0 40px rgba(0,245,255,0.4), 0 0 80px rgba(0,245,255,0.2)',
          animation: 'genScanDown 2s ease-in-out infinite',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: '3px',
          background:
            'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.3) 10%, rgba(168,85,247,0.9) 50%, rgba(168,85,247,0.3) 90%, transparent 100%)',
          boxShadow: '0 0 15px rgba(168,85,247,0.8), 0 0 30px rgba(168,85,247,0.4)',
          animation: 'genScanDown 2s ease-in-out 1s infinite',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: '2px',
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
          boxShadow: '0 0 10px rgba(255,255,255,0.6)',
          animation: 'genScanDown 2s ease-in-out 0.5s infinite',
        }}
      />

      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.6 }}>
        <defs>
          <linearGradient id="neuralGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(0,245,255,0)" />
            <stop offset="50%" stopColor="rgba(0,245,255,1)" />
            <stop offset="100%" stopColor="rgba(168,85,247,0)" />
          </linearGradient>
        </defs>
        {[...Array(8)].map((_, i) => (
          <line
            key={i}
            x1={`${10 + i * 12}%`}
            y1="20%"
            x2={`${15 + i * 10}%`}
            y2="80%"
            stroke="url(#neuralGrad)"
            strokeWidth="1"
            style={{
              animation: `neuralPulse ${1.5 + i * 0.2}s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </svg>

      {[...Array(15)].map((_, i) => (
        <div
          key={`p1-${i}`}
          style={{
            position: 'absolute',
            width: i % 3 === 0 ? '5px' : i % 3 === 1 ? '3px' : '4px',
            height: i % 3 === 0 ? '5px' : i % 3 === 1 ? '3px' : '4px',
            borderRadius: '50%',
            background: i % 4 === 0 ? '#00f5ff' : i % 4 === 1 ? '#667eea' : i % 4 === 2 ? '#a855f7' : '#60a5fa',
            boxShadow: `0 0 8px ${i % 4 === 0 ? '#00f5ff' : i % 4 === 1 ? '#667eea' : i % 4 === 2 ? '#a855f7' : '#60a5fa'}`,
            left: `${5 + i * 6.5}%`,
            top: `${15 + (i % 5) * 18}%`,
            animation: `genParticleFloat ${1.8 + i * 0.15}s ease-in-out ${i * 0.12}s infinite`,
          }}
        />
      ))}

      {[...Array(6)].map((_, i) => (
        <div
          key={`p2-${i}`}
          style={{
            position: 'absolute',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,245,255,1) 0%, rgba(0,245,255,0) 70%)',
            boxShadow: '0 0 15px #00f5ff',
            left: `${8 + i * 15}%`,
            top: `${10 + (i % 3) * 30}%`,
            animation: `genParticleBreathe ${2.5 + i * 0.3}s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}

      {([0, 0.7, 1.4] as const).map((delay, idx) => (
        <div
          key={idx}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '20px',
            height: '20px',
            transform: 'translate(-50%, -50%)',
            border: `${idx === 0 ? 2 : 1}px solid ${idx === 0 ? 'rgba(0,245,255,0.5)' : idx === 1 ? 'rgba(168,85,247,0.4)' : 'rgba(102,126,234,0.3)'}`,
            borderRadius: '50%',
            animation: `genEnergyWave 2s ease-out ${delay}s infinite`,
          }}
        />
      ))}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(0,245,255,0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,245,255,0.15) 1px, transparent 1px),
            linear-gradient(rgba(168,85,247,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(168,85,247,0.08) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px, 60px 60px, 30px 30px, 30px 30px',
          backgroundPosition: '0 0, 0 0, 30px 30px, 30px 30px',
          animation: 'genGridPulse 3s ease-in-out infinite',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `repeating-linear-gradient(
            90deg,
            transparent,
            transparent 20px,
            rgba(0,245,255,0.02) 20px,
            rgba(0,245,255,0.02) 21px
          )`,
          animation: 'genRasterScan 4s linear infinite',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          width: '30px',
          height: '30px',
          borderTop: '2px solid rgba(0,245,255,0.8)',
          borderLeft: '2px solid rgba(0,245,255,0.8)',
          boxShadow: '0 0 10px rgba(0,245,255,0.5)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '30px',
          height: '30px',
          borderTop: '2px solid rgba(0,245,255,0.8)',
          borderRight: '2px solid rgba(0,245,255,0.8)',
          boxShadow: '0 0 10px rgba(0,245,255,0.5)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          width: '30px',
          height: '30px',
          borderBottom: '2px solid rgba(168,85,247,0.8)',
          borderLeft: '2px solid rgba(168,85,247,0.8)',
          boxShadow: '0 0 10px rgba(168,85,247,0.5)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          width: '30px',
          height: '30px',
          borderBottom: '2px solid rgba(168,85,247,0.8)',
          borderRight: '2px solid rgba(168,85,247,0.8)',
          boxShadow: '0 0 10px rgba(168,85,247,0.5)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: '15px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '11px',
          color: 'rgba(0,245,255,0.9)',
          textShadow: '0 0 10px rgba(0,245,255,0.8)',
          fontFamily: 'monospace',
          letterSpacing: '2px',
          animation: 'genTextBlink 1s ease-in-out infinite',
        }}
      >
        ◉ PROCESSING ◈
      </div>
    </div>
  );
}
