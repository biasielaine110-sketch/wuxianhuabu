import React, { useState, useRef, useEffect } from 'react';

export function VideoTestComponent() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [videoInfo, setVideoInfo] = useState<{ duration?: number; width?: number; height?: number }>({});

  const videoUrl = 'http://localhost:3107/outputs/jimeng_video_1779177756122.mp4';

  const testVideo = () => {
    if (!videoRef.current) return;

    setStatus('loading');
    setErrorMessage('');
    setVideoInfo({});

    const video = videoRef.current;

    const onLoadedData = () => {
      setStatus('success');
      setVideoInfo({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      console.log('✅ 视频加载成功:', {
        url: videoUrl,
        duration: video.duration,
        size: `${video.videoWidth}x${video.videoHeight}`,
        readyState: video.readyState,
      });
    };

    const onError = (e: Event) => {
      setStatus('error');
      const error = (e.target as HTMLVideoElement).error;
      const message = error ? `代码 ${error.code}: ${error.message}` : '未知错误';
      setErrorMessage(message);
      console.error('❌ 视频加载失败:', error || e);
    };

    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('error', onError);

    // 触发加载
    video.load();

    // 清理
    return () => {
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('error', onError);
    };
  };

  useEffect(() => {
    // 组件加载后自动测试
    const timeout = setTimeout(testVideo, 1000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      width: '400px',
      background: '#1a1a1a',
      border: '2px solid #333',
      borderRadius: '8px',
      padding: '20px',
      zIndex: 9999,
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    }}>
      <h2 style={{ margin: '0 0 15px 0', color: '#3b82f6' }}>🎬 视频播放测试</h2>
      
      <div style={{ marginBottom: '15px' }}>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '5px' }}>视频URL:</div>
        <div style={{
          fontSize: '11px',
          background: '#222',
          padding: '8px',
          borderRadius: '4px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {videoUrl}
        </div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          style={{
            width: '100%',
            background: '#000',
            borderRadius: '4px',
            border: '1px solid #444',
          }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <button
          onClick={testVideo}
          style={{
            width: '100%',
            padding: '10px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          {status === 'loading' ? '测试中...' : '测试视频播放'}
        </button>
      </div>

      <div style={{
        padding: '10px',
        borderRadius: '4px',
        background: status === 'success' ? '#2e7d3220' : 
                   status === 'error' ? '#c6282820' : 
                   status === 'loading' ? '#1565c020' : '#33333320',
        border: `1px solid ${
          status === 'success' ? '#2e7d32' : 
          status === 'error' ? '#c62828' : 
          status === 'loading' ? '#1565c0' : '#444'
        }`,
        color: status === 'success' ? '#4caf50' : 
               status === 'error' ? '#f44336' : 
               status === 'loading' ? '#2196f3' : '#888',
      }}>
        {status === 'idle' && '等待测试...'}
        {status === 'loading' && '正在加载视频...'}
        {status === 'success' && (
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>✅ 视频加载成功！</div>
            <div style={{ fontSize: '12px' }}>
              时长: {videoInfo.duration?.toFixed(2)}秒<br/>
              尺寸: {videoInfo.width}×{videoInfo.height}<br/>
              格式: MP4
            </div>
          </div>
        )}
        {status === 'error' && (
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>❌ 视频加载失败</div>
            <div style={{ fontSize: '12px' }}>{errorMessage}</div>
          </div>
        )}
      </div>

      <div style={{ marginTop: '15px', fontSize: '11px', color: '#666', textAlign: 'center' }}>
        按 ESC 关闭此测试窗口
      </div>
    </div>
  );
}

// 使用说明：在App.tsx中添加这个组件进行测试
export function setupVideoTest() {
  const [showTest, setShowTest] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowTest(false);
      }
      if (e.key === 'F8') { // 按F8打开测试
        setShowTest(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { showTest, setShowTest };
}