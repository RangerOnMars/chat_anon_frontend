import { cn } from '@/utils/cn';
import { useChatStore } from '@/stores/chatStore';
import type { PipelineStage } from '@/utils/websocket';
import { Mic, Brain, Volume2, Check, Loader2 } from 'lucide-react';

const stageConfig: Record<
  PipelineStage,
  {
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    color: string;
    bgColor: string;
  }
> = {
  idle: {
    label: '待命',
    icon: Check,
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/20',
  },
  asr: {
    label: '语音识别',
    icon: Mic,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
  llm: {
    label: 'AI 思考',
    icon: Brain,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
  },
  tts: {
    label: '语音合成',
    icon: Volume2,
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
  },
  playing: {
    label: '播放中',
    icon: Volume2,
    color: 'text-primary-400',
    bgColor: 'bg-primary-500/20',
  },
};

const stages: PipelineStage[] = ['asr', 'llm', 'tts', 'playing'];

export function StatusIndicator() {
  // Use selectors to avoid subscribing to entire store
  const pipelineStage = useChatStore((state) => state.pipelineStage);
  const isPlaying = useChatStore((state) => state.isPlaying);
  const isThinking = useChatStore((state) => state.isThinking);
  const partialTranscription = useChatStore((state) => state.partialTranscription);

  // Playing stage follows isPlaying (same as Live2D) so speaker indicator stays in sync with actual playback
  const effectiveStage: PipelineStage = isPlaying ? 'playing' : pipelineStage;
  const currentStageIndex = stages.indexOf(effectiveStage);
  const isProcessing = pipelineStage !== 'idle' || isThinking || isPlaying;

  return (
    <div className="glass rounded-xl p-4">
      {/* Pipeline Progress */}
      <div className="flex items-center justify-between mb-3">
        {stages.map((stage, index) => {
          const config = stageConfig[stage];
          const isActive = stage === effectiveStage;
          const isCompleted = currentStageIndex > index;
          const Icon = config.icon;

          return (
            <div key={stage} className="flex items-center">
              {/* Stage indicator */}
              <div
                className={cn(
                  'flex items-center justify-center w-10 h-10 rounded-full',
                  'transition-all duration-300',
                  isActive && config.bgColor,
                  isActive && config.color,
                  isCompleted && 'bg-green-500/20 text-green-400',
                  !isActive && !isCompleted && 'bg-white/5 text-white/30'
                )}
              >
                {isActive ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : isCompleted ? (
                  <Check size={20} />
                ) : (
                  <Icon size={20} />
                )}
              </div>

              {/* Connector line */}
              {index < stages.length - 1 && (
                <div
                  className={cn(
                    'w-8 h-0.5 mx-1',
                    'transition-colors duration-300',
                    isCompleted ? 'bg-green-400' : 'bg-white/10'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Stage Labels */}
      <div className="flex items-center justify-between text-xs">
        {stages.map((stage) => {
          const config = stageConfig[stage];
          const isActive = stage === effectiveStage;

          return (
            <div
              key={stage}
              className={cn(
                'text-center w-10',
                'transition-colors duration-300',
                isActive ? config.color : 'text-white/30'
              )}
            >
              {config.label}
            </div>
          );
        })}
      </div>

      {/* Current Status */}
      <div className="mt-4 pt-3 border-t border-white/10">
        <div className="flex items-center gap-2">
          {isProcessing ? (
            <>
              <span
                className={cn(
                  'w-2 h-2 rounded-full animate-pulse',
                  stageConfig[effectiveStage]?.bgColor || 'bg-primary-500'
                )}
              />
              <span className="text-sm">
                {stageConfig[effectiveStage]?.label || '处理中'}...
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-white/60">就绪</span>
            </>
          )}
        </div>

        {/* Partial Transcription */}
        {partialTranscription && (
          <div className="mt-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-sm text-blue-300 italic">
              "{partialTranscription}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
