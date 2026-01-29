import { cn } from '@/utils/cn';
import type { ChatMessage as ChatMessageType } from '@/stores/chatStore';
import { User, Bot } from 'lucide-react';

interface ChatMessageProps {
  message: ChatMessageType;
}

const emotionColors: Record<string, string> = {
  happy: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  sad: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  angry: 'bg-red-500/20 text-red-300 border-red-500/30',
  surprised: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  thinking: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  idle: 'bg-green-500/20 text-green-300 border-green-500/30',
};

const emotionLabels: Record<string, string> = {
  happy: '开心',
  sad: '难过',
  angry: '生气',
  surprised: '惊讶',
  thinking: '思考',
  idle: '平静',
  auto: '自动',
};

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex gap-3 animate-slide-up',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
          isUser
            ? 'bg-primary-500/20 text-primary-400'
            : 'bg-accent-500/20 text-accent-400'
        )}
      >
        {isUser ? <User size={20} /> : <Bot size={20} />}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          'flex flex-col max-w-[75%] gap-1',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        {/* Emotion Badge (for assistant) */}
        {!isUser && message.emotion && (
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full border',
              emotionColors[message.emotion] || emotionColors.idle
            )}
          >
            {emotionLabels[message.emotion] || message.emotion}
          </span>
        )}

        {/* Message Bubble */}
        <div
          className={cn(
            'px-4 py-3 rounded-2xl',
            isUser
              ? 'bg-primary-500/20 text-white rounded-tr-sm'
              : 'glass rounded-tl-sm',
            message.isPartial && 'opacity-70'
          )}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>

          {/* Japanese text (for assistant) */}
          {!isUser && message.contentJp && (
            <p className="text-xs mt-2 opacity-60 border-t border-white/10 pt-2">
              {message.contentJp}
            </p>
          )}
        </div>

        {/* Timestamp */}
        <span className="text-xs opacity-40">
          {message.timestamp.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  );
}
