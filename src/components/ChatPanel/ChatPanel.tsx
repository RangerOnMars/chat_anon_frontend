import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/utils/cn';

export function ChatPanel() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Use selectors to avoid subscribing to entire store
  const messages = useChatStore((state) => state.messages);
  const partialTranscription = useChatStore((state) => state.partialTranscription);
  const isThinking = useChatStore((state) => state.isThinking);
  const connectionStatus = useChatStore((state) => state.connectionStatus);
  const { sendTextMessage } = useWebSocket();

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partialTranscription, isThinking]);

  return (
    <div className="chat-panel flex flex-col h-full glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <Sparkles size={18} className="text-primary-400" />
          对话
        </h2>
        <span className="text-xs opacity-50">
          {messages.length} 条消息
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
            <Sparkles size={48} className="mb-4 text-primary-400" />
            <p className="text-lg font-medium">开始对话吧！</p>
            <p className="text-sm mt-1">
              {connectionStatus === 'connected'
                ? '输入消息或使用语音与爱音聊天'
                : '请先连接服务器'}
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))
        )}

        {/* Partial Transcription */}
        {partialTranscription && (
          <div className="flex gap-3 animate-fade-in">
            <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
              <Loader2 size={16} className="animate-spin text-primary-400" />
            </div>
            <div className="glass px-4 py-3 rounded-2xl rounded-tl-sm max-w-[75%]">
              <p className="text-sm opacity-70 italic">
                {partialTranscription}...
              </p>
            </div>
          </div>
        )}

        {/* Thinking Indicator */}
        {isThinking && !partialTranscription && (
          <div className="flex gap-3 animate-fade-in">
            <div className="w-10 h-10 rounded-full bg-accent-500/20 flex items-center justify-center flex-shrink-0">
              <Loader2 size={16} className="animate-spin text-accent-400" />
            </div>
            <div className={cn(
              'glass px-4 py-3 rounded-2xl rounded-tl-sm',
              'flex items-center gap-2'
            )}>
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-sm opacity-70">思考中...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={sendTextMessage} />
    </div>
  );
}
