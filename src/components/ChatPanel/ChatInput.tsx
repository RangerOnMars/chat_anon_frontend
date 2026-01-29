import { useState, useRef, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { Send, Loader2 } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isThinking, connectionStatus } = useChatStore();

  const isDisabled = disabled || connectionStatus !== 'connected' || isThinking;

  const handleSubmit = () => {
    if (input.trim() && !isDisabled) {
      onSend(input.trim());
      setInput('');
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [input]);

  return (
    <div className="flex items-end gap-2 p-4 border-t border-white/10">
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            connectionStatus !== 'connected'
              ? '请先连接服务器...'
              : isThinking
              ? '等待回复中...'
              : '输入消息，按 Enter 发送...'
          }
          disabled={isDisabled}
          rows={1}
          className={cn(
            'w-full px-4 py-3 rounded-2xl resize-none',
            'bg-white/5 border border-white/10',
            'placeholder:text-white/30',
            'focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20',
            'transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={isDisabled || !input.trim()}
        className={cn(
          'flex-shrink-0 p-3 rounded-full',
          'bg-primary-500 hover:bg-primary-600',
          'text-white',
          'transition-all duration-200',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary-500',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/50'
        )}
      >
        {isThinking ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <Send size={20} />
        )}
      </button>
    </div>
  );
}
