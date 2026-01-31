import { Fragment } from 'react';
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
    label: '思考中',
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
    <div className="glass rounded-xl px-6 py-4">
      {/* Pipeline Progress - full bar width, each icon centered in its column */}
      <div className="w-full mb-3">
        <div className="flex items-center w-full min-w-0">
        {stages.map((stage, index) => {
          const config = stageConfig[stage];
          const isActive = stage === effectiveStage;
          const isCompleted = currentStageIndex > index;
          const Icon = config.icon;

          return (
            <Fragment key={stage}>
              {/* Column: w-16 to match label column so icon/text centerlines align */}
              <div className="flex flex-shrink-0 w-16 justify-center">
                <div
                  className={cn(
                    'flex items-center justify-center w-12 h-12 rounded-full',
                    'transition-all duration-300',
                    isActive && config.bgColor,
                    isActive && config.color,
                    isCompleted && 'bg-green-500/20 text-green-400',
                    !isActive && !isCompleted && 'bg-white/5 text-white/30'
                  )}
                >
                  {isActive ? (
                    <Loader2 size={24} className="animate-spin" />
                  ) : isCompleted ? (
                    <Check size={24} />
                  ) : (
                    <Icon size={24} />
                  )}
                </div>
              </div>
              {/* Connector: flex-1 so it fills space between icons */}
              {index < stages.length - 1 && (
                <div
                  className={cn(
                    'flex-1 min-w-6 h-px',
                    'transition-colors duration-300',
                    isCompleted ? 'bg-green-400' : 'bg-white/20'
                  )}
                />
              )}
            </Fragment>
          );
        })}
        </div>
      </div>

      {/* Stage Labels - full bar width, each label centered under icon */}
      <div className="w-full text-sm">
        <div className="flex items-center w-full min-w-0">
        {stages.map((stage, index) => {
          const config = stageConfig[stage];
          const isActive = stage === effectiveStage;

          return (
            <Fragment key={stage}>
              <div
                className={cn(
                  'flex flex-shrink-0 w-16 justify-center',
                  'transition-colors duration-300',
                  isActive ? config.color : 'text-white/30'
                )}
              >
                <span className="text-center whitespace-nowrap">
                  {config.label}
                </span>
              </div>
              {index < stages.length - 1 && (
                <span className="flex-1 min-w-6" aria-hidden />
              )}
            </Fragment>
          );
        })}
        </div>
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
