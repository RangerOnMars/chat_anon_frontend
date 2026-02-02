import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { useChatStore, type VoiceMode } from '@/stores/chatStore';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
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
    startVoiceCall,
    sendVoiceCallChunk,
    stopVoiceCall,
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

  // Voice call: Toggle (streaming chunks to backend)
  const handleVoiceCallToggle = useCallback(async () => {
    if (isDisabled) return;

    if (voiceMode === 'voice_call') {
      stopVoiceCall();
      stopRecording();
      setStreamingChunkHandler(null);
      setVoiceMode('idle');
    } else {
      setVoiceMode('voice_call');
      startVoiceCall();

      setStreamingChunkHandler(() => (base64: string) => {
        sendVoiceCallChunk(base64);
      });

      try {
        await startRecording({ onChunk: (base64) => sendVoiceCallChunk(base64) });
      } catch (error) {
        console.error('Failed to start voice call:', error);
        setVoiceMode('idle');
        setStreamingChunkHandler(null);
      }
    }
  }, [
    isDisabled,
    voiceMode,
    startRecording,
    stopRecording,
    startVoiceCall,
    sendVoiceCallChunk,
    stopVoiceCall,
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
    <div className="flex flex-col gap-3 p-4 border-t border-white/10">
      {/* Hint */}
      <p className="text-xs text-white/50">
        单句：按住说话 | 通话：点击开始/结束
      </p>
      <div className="flex items-center gap-3">
        {/* Single-sentence (push-to-talk) */}
        <button
          onMouseDown={handlePushToTalkStart}
          onMouseUp={handlePushToTalkEnd}
          onMouseLeave={handlePushToTalkEnd}
          onTouchStart={handlePushToTalkStart}
          onTouchEnd={handlePushToTalkEnd}
          disabled={isDisabled || voiceMode === 'voice_call'}
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
          title="单句语音：按住说话"
        >
          {voiceMode === 'push-to-talk' ? (
            <>
              <span className="absolute inset-0 rounded-full bg-red-500 pulse-ring" />
              <Mic size={24} />
            </>
          ) : (
            <Mic size={24} />
          )}
        </button>

        {/* Volume indicator (when recording) */}
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

        <div className="w-px h-8 bg-white/10" />

        {/* Voice call: toggle */}
        <button
          onClick={handleVoiceCallToggle}
          disabled={isDisabled || voiceMode === 'push-to-talk'}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/50',
            voiceMode === 'voice_call'
              ? 'bg-red-500/90 text-white hover:bg-red-500'
              : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white',
            isDisabled && 'opacity-50 cursor-not-allowed'
          )}
          title="语音通话：点击开始/结束"
        >
          {voiceMode === 'voice_call' ? (
            <>
              <PhoneOff size={18} />
              <span className="text-sm font-medium">挂断</span>
            </>
          ) : (
            <>
              <Phone size={18} />
              <span className="text-sm">语音通话</span>
            </>
          )}
        </button>

        {/* Status: 聆听中 / 处理中 */}
        {voiceMode === 'voice_call' && !isThinking && (
          <span className="text-sm text-primary-400">聆听中…</span>
        )}
        {isThinking && (
          <div className="flex items-center gap-2 text-primary-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">处理中…</span>
          </div>
        )}
      </div>
    </div>
  );
}
