import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { useChatStore } from '@/stores/chatStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ChevronDown, Check, Loader2 } from 'lucide-react';

export function CharacterSelector() {
  const [isOpen, setIsOpen] = useState(false);
  // Use selectors to avoid subscribing to entire store
  const currentCharacter = useChatStore((state) => state.currentCharacter);
  const characters = useChatStore((state) => state.characters);
  const connectionStatus = useChatStore((state) => state.connectionStatus);
  const { switchCharacter, fetchCharacters } = useWebSocket();

  // Fetch characters on mount
  useEffect(() => {
    fetchCharacters();
  }, [fetchCharacters]);

  const handleSelect = (characterName: string) => {
    if (characterName !== currentCharacter?.name) {
      switchCharacter(characterName);
    }
    setIsOpen(false);
  };

  const isDisabled = connectionStatus !== 'connected';

  return (
    <div className="relative">
      <button
        onClick={() => !isDisabled && setIsOpen(!isOpen)}
        disabled={isDisabled}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'bg-white/5 border border-white/10',
          'hover:bg-white/10 hover:border-white/20',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/50',
          isDisabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {connectionStatus !== 'connected' ? (
          <span className="text-sm text-white/50">未连接</span>
        ) : currentCharacter ? (
          <>
            <span className="text-sm font-medium">
              {currentCharacter.display_name || currentCharacter.name}
            </span>
            <ChevronDown
              size={16}
              className={cn(
                'transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </>
        ) : (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">加载中...</span>
          </>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && characters.length > 0 && (
        <div
          className={cn(
            'absolute top-full left-0 mt-2 min-w-[200px]',
            'glass rounded-lg overflow-hidden z-50',
            'animate-fade-in'
          )}
        >
          {characters.map((character) => (
            <button
              key={character.name}
              onClick={() => handleSelect(character.name)}
              className={cn(
                'w-full flex items-center gap-2 px-4 py-3',
                'hover:bg-white/10',
                'transition-colors duration-150',
                'text-left',
                character.name === currentCharacter?.name && 'bg-primary-500/20'
              )}
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{character.display_name}</p>
                <p className="text-xs opacity-50 mt-0.5 line-clamp-1">
                  {character.description}
                </p>
              </div>
              {character.name === currentCharacter?.name && (
                <Check size={16} className="text-primary-400 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
