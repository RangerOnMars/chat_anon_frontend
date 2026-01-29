import { useEffect, useRef, useCallback } from 'react';
import { useLive2D } from '@/hooks/useLive2D';
import { useChatStore } from '@/stores/chatStore';
import { cn } from '@/utils/cn';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

// Model path - adjust if needed
const MODEL_PATH = '/live2d/live2D_model/3.model.json';

export function Live2DCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { initialize, isLoaded, loadError, controller } = useLive2D(MODEL_PATH);
  const { messages, isPlaying } = useChatStore();
  const lastEmotionRef = useRef<string>('idle');

  // Initialize on mount
  useEffect(() => {
    if (containerRef.current) {
      initialize(containerRef.current);
    }
  }, [initialize]);

  // Play emotion when new assistant message arrives
  useEffect(() => {
    if (!isLoaded) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage.emotion) {
      const emotion = lastMessage.emotion;
      if (emotion !== lastEmotionRef.current) {
        lastEmotionRef.current = emotion;
        controller.playEmotion(emotion);
      }
    }
  }, [messages, isLoaded, controller]);

  // Simulate lip sync when audio is playing
  useEffect(() => {
    if (!isLoaded) return;

    let animationFrame: number;
    let lipSyncValue = 0;
    let increasing = true;

    const animateLipSync = () => {
      if (isPlaying) {
        // Simple sine wave animation for lip sync
        if (increasing) {
          lipSyncValue += 0.15;
          if (lipSyncValue >= 1) {
            increasing = false;
          }
        } else {
          lipSyncValue -= 0.15;
          if (lipSyncValue <= 0) {
            increasing = true;
          }
        }
        // Add some randomness
        const randomized = lipSyncValue * (0.7 + Math.random() * 0.3);
        controller.setLipSync(randomized);
      } else {
        controller.setLipSync(0);
      }

      animationFrame = requestAnimationFrame(animateLipSync);
    };

    if (isPlaying) {
      animateLipSync();
    } else {
      controller.setLipSync(0);
    }

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isPlaying, isLoaded, controller]);

  // Retry loading
  const handleRetry = useCallback(() => {
    if (containerRef.current) {
      // Clear container
      containerRef.current.innerHTML = '';
      initialize(containerRef.current);
    }
  }, [initialize]);

  return (
    <div className="relative w-full h-full glass rounded-2xl overflow-hidden">
      {/* Live2D Container */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ touchAction: 'none' }}
      />

      {/* Loading State */}
      {!isLoaded && !loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
          <Loader2 size={48} className="animate-spin text-primary-400 mb-4" />
          <p className="text-sm opacity-70">加载 Live2D 模型中...</p>
        </div>
      )}

      {/* Error State */}
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <AlertCircle size={48} className="text-red-400 mb-4" />
          <p className="text-sm text-red-300 mb-2">加载模型失败</p>
          <p className="text-xs opacity-50 mb-4 text-center max-w-xs">{loadError}</p>
          <button
            onClick={handleRetry}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg',
              'bg-primary-500 hover:bg-primary-600',
              'text-white text-sm',
              'transition-colors duration-200'
            )}
          >
            <RefreshCw size={16} />
            重试
          </button>
        </div>
      )}

      {/* Model Info Overlay */}
      {isLoaded && (
        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
          <div className="text-xs opacity-50">
            点击模型可触发动作
          </div>
          {isPlaying && (
            <div className="flex items-center gap-2 text-xs text-primary-400">
              <span className="w-2 h-2 bg-primary-400 rounded-full animate-pulse" />
              播放中
            </div>
          )}
        </div>
      )}
    </div>
  );
}
