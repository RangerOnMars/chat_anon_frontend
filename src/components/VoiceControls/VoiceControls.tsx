import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { useChatStore, type VoiceMode } from '@/stores/chatStore';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  Mic,
  MicOff,
  Radio,
  RadioTower,
  Square,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export function VoiceControls() {
  // Use selectors to avoid subscribing to entire store
  const connectionStatus = useChatStore((state) => state.connectionStatus);
  const voiceMode = useChatStore((state) => state.voiceMode);
  const isRecording = useChatStore((state) => state.isRecording);
  const isThinking = useChatStore((state) => state.isThinking);
  const volumeLevel = useChatStore((state) => state.volumeLevel);
  const setVoiceMode = useChatStore((state) => state.setVoiceMode);

  const {
    sendAudioMessage,
    startAudioStream,
    sendAudioStreamChunk,
    endAudioStream,
    startAgentMode,
    sendAgentAudioChunk,
    stopAgentMode,
  } = useWebSocket();

  const [streamingChunkHandler, setStreamingChunkHandler] = useState<
    ((base64: string) => void) | null
  >(null);

  const longPressTimerRef = useRef<number | null>(null);
  const isPressedRef = useRef(false);

  // Audio recorder for streaming modes
  const { startRecording, stopRecording, cancelRecording, isSupported, permissionDenied } =
    useAudioRecorder({
      onChunk: streamingChunkHandler || undefined,
      chunkIntervalMs: 100,
    });

  const isDisabled =
    connectionStatus !== 'connected' || isThinking || !isSupported;

  // Push-to-talk: Start recording
  const handlePushToTalkStart = useCallback(async () => {
    if (isDisabled) return;
    
    isPressedRef.current = true;
    
    // Use long press timer to differentiate from click
    longPressTimerRef.current = window.setTimeout(async () => {
      if (isPressedRef.current) {
        setVoiceMode('push-to-talk');
        try {
          await startRecording();
        } catch (error) {
          console.error('Failed to start recording:', error);
          setVoiceMode('idle');
        }
      }
    }, 150);
  }, [isDisabled, setVoiceMode, startRecording]);

  // Push-to-talk: Stop recording and send
  const handlePushToTalkEnd = useCallback(() => {
    isPressedRef.current = false;
    
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (voiceMode === 'push-to-talk' && isRecording) {
      const audioData = stopRecording();
      if (audioData) {
        sendAudioMessage(audioData);
      }
      setVoiceMode('idle');
    }
  }, [voiceMode, isRecording, stopRecording, sendAudioMessage, setVoiceMode]);

  // Streaming mode: Toggle
  const handleStreamingToggle = useCallback(async () => {
    if (isDisabled) return;

    if (voiceMode === 'streaming') {
      // Stop streaming
      endAudioStream();
      stopRecording();
      setStreamingChunkHandler(null);
      setVoiceMode('idle');
    } else {
      // Start streaming
      setVoiceMode('streaming');
      startAudioStream();
      
      // Set chunk handler for streaming
      setStreamingChunkHandler(() => (base64: string) => {
        sendAudioStreamChunk(base64);
      });

      try {
        await startRecording();
      } catch (error) {
        console.error('Failed to start streaming:', error);
        setVoiceMode('idle');
        setStreamingChunkHandler(null);
      }
    }
  }, [
    isDisabled,
    voiceMode,
    startRecording,
    stopRecording,
    startAudioStream,
    sendAudioStreamChunk,
    endAudioStream,
    setVoiceMode,
  ]);

  // Agent mode: Toggle
  const handleAgentToggle = useCallback(async () => {
    if (isDisabled) return;

    if (voiceMode === 'agent') {
      // Stop agent mode
      stopAgentMode();
      stopRecording();
      setStreamingChunkHandler(null);
      setVoiceMode('idle');
    } else {
      // Start agent mode
      setVoiceMode('agent');
      startAgentMode();

      // Set chunk handler for agent mode
      setStreamingChunkHandler(() => (base64: string) => {
        sendAgentAudioChunk(base64);
      });

      try {
        await startRecording();
      } catch (error) {
        console.error('Failed to start agent mode:', error);
        setVoiceMode('idle');
        setStreamingChunkHandler(null);
      }
    }
  }, [
    isDisabled,
    voiceMode,
    startRecording,
    stopRecording,
    startAgentMode,
    sendAgentAudioChunk,
    stopAgentMode,
    setVoiceMode,
  ]);

  // Cancel any recording on mode change or disconnect
  useEffect(() => {
    if (connectionStatus !== 'connected' && isRecording) {
      cancelRecording();
      setVoiceMode('idle');
      setStreamingChunkHandler(null);
    }
  }, [connectionStatus, isRecording, cancelRecording, setVoiceMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-red-400 text-sm">
        <AlertCircle size={16} />
        <span>浏览器不支持音频录制</span>
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-yellow-400 text-sm">
        <MicOff size={16} />
        <span>请允许麦克风权限</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-4 border-t border-white/10">
      {/* Push-to-talk button */}
      <button
        onMouseDown={handlePushToTalkStart}
        onMouseUp={handlePushToTalkEnd}
        onMouseLeave={handlePushToTalkEnd}
        onTouchStart={handlePushToTalkStart}
        onTouchEnd={handlePushToTalkEnd}
        disabled={isDisabled || voiceMode === 'streaming' || voiceMode === 'agent'}
        className={cn(
          'relative flex items-center justify-center',
          'w-14 h-14 rounded-full',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/50',
          voiceMode === 'push-to-talk'
            ? 'bg-red-500 text-white scale-110'
            : 'bg-primary-500/20 text-primary-400 hover:bg-primary-500/30',
          isDisabled && 'opacity-50 cursor-not-allowed'
        )}
        title="按住说话"
      >
        {voiceMode === 'push-to-talk' ? (
          <>
            {/* Pulsing ring animation */}
            <span className="absolute inset-0 rounded-full bg-red-500 pulse-ring" />
            <Mic size={24} />
          </>
        ) : (
          <Mic size={24} />
        )}
      </button>

      {/* Volume indicator */}
      {isRecording && (
        <div className="flex items-center gap-1 h-8">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-1 rounded-full transition-all duration-75',
                volumeLevel > i * 0.2 ? 'bg-primary-400' : 'bg-white/20'
              )}
              style={{
                height: `${Math.max(8, volumeLevel * 32 * (1 + i * 0.1))}px`,
              }}
            />
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="w-px h-8 bg-white/10" />

      {/* Streaming mode button */}
      <button
        onClick={handleStreamingToggle}
        disabled={isDisabled || voiceMode === 'push-to-talk' || voiceMode === 'agent'}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/50',
          voiceMode === 'streaming'
            ? 'bg-yellow-500 text-black'
            : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white',
          isDisabled && 'opacity-50 cursor-not-allowed'
        )}
        title="流式语音"
      >
        {voiceMode === 'streaming' ? (
          <>
            <Square size={18} />
            <span className="text-sm font-medium">停止</span>
          </>
        ) : (
          <>
            <Radio size={18} />
            <span className="text-sm">流式</span>
          </>
        )}
      </button>

      {/* Agent mode button */}
      <button
        onClick={handleAgentToggle}
        disabled={isDisabled || voiceMode === 'push-to-talk' || voiceMode === 'streaming'}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/50',
          voiceMode === 'agent'
            ? 'bg-green-500 text-black'
            : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white',
          isDisabled && 'opacity-50 cursor-not-allowed'
        )}
        title="Agent 模式"
      >
        {voiceMode === 'agent' ? (
          <>
            <Square size={18} />
            <span className="text-sm font-medium">停止</span>
          </>
        ) : (
          <>
            <RadioTower size={18} />
            <span className="text-sm">Agent</span>
          </>
        )}
      </button>

      {/* Loading indicator */}
      {isThinking && (
        <div className="flex items-center gap-2 text-primary-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">处理中...</span>
        </div>
      )}
    </div>
  );
}
