import { useState } from 'react';
import { cn } from '@/utils/cn';
import { useChatStore } from '@/stores/chatStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { CharacterSelector } from '@/components/CharacterSelector';
import {
  Wifi,
  WifiOff,
  Sun,
  Moon,
  Trash2,
  Settings,
  X,
  Loader2,
} from 'lucide-react';

export function Header() {
  const [showSettings, setShowSettings] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  // Use selectors to avoid subscribing to entire store
  const connectionStatus = useChatStore((state) => state.connectionStatus);
  const currentCharacter = useChatStore((state) => state.currentCharacter);
  const apiToken = useChatStore((state) => state.apiToken);
  const isDarkMode = useChatStore((state) => state.isDarkMode);
  const setApiToken = useChatStore((state) => state.setApiToken);
  const toggleDarkMode = useChatStore((state) => state.toggleDarkMode);

  const { connect, disconnect, clearHistory } = useWebSocket();

  const handleConnect = () => {
    if (connectionStatus === 'connected') {
      disconnect();
    } else {
      connect('anon');
    }
  };

  const handleSaveToken = () => {
    setApiToken(tokenInput);
    setShowSettings(false);
  };

  const statusColors = {
    connected: 'text-green-400',
    connecting: 'text-yellow-400',
    disconnected: 'text-gray-400',
    error: 'text-red-400',
  };

  const statusText = {
    connected: '已连接',
    connecting: '连接中...',
    disconnected: '未连接',
    error: '连接错误',
  };

  return (
    <>
      <header className="flex items-center justify-between p-4 border-b border-white/10">
        {/* Left: Logo and Character */}
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold gradient-text">Chat Anon</h1>
          <CharacterSelector />
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          {/* Connection Status */}
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full',
              'bg-white/5 text-sm',
              statusColors[connectionStatus]
            )}
          >
            {connectionStatus === 'connecting' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : connectionStatus === 'connected' ? (
              <Wifi size={14} />
            ) : (
              <WifiOff size={14} />
            )}
            <span>{statusText[connectionStatus]}</span>
          </div>

          {/* Connect/Disconnect Button */}
          <button
            onClick={handleConnect}
            disabled={!apiToken || connectionStatus === 'connecting'}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium',
              'transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/50',
              connectionStatus === 'connected'
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-primary-500 text-white hover:bg-primary-600',
              (!apiToken || connectionStatus === 'connecting') &&
                'opacity-50 cursor-not-allowed'
            )}
          >
            {connectionStatus === 'connected' ? '断开' : '连接'}
          </button>

          {/* Clear History */}
          <button
            onClick={clearHistory}
            disabled={connectionStatus !== 'connected'}
            className={cn(
              'p-2 rounded-lg',
              'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
              'transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/50',
              connectionStatus !== 'connected' && 'opacity-50 cursor-not-allowed'
            )}
            title="清除历史"
          >
            <Trash2 size={18} />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleDarkMode}
            className={cn(
              'p-2 rounded-lg',
              'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
              'transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/50'
            )}
            title={isDarkMode ? '切换到亮色' : '切换到暗色'}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Settings */}
          <button
            onClick={() => {
              setTokenInput(apiToken);
              setShowSettings(true);
            }}
            className={cn(
              'p-2 rounded-lg',
              'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
              'transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/50'
            )}
            title="设置"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md glass rounded-2xl p-6 animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">设置</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* API Token */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  API Token
                </label>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="输入你的 API Token"
                  className={cn(
                    'w-full px-4 py-3 rounded-lg',
                    'bg-white/5 border border-white/10',
                    'placeholder:text-white/30',
                    'focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20',
                    'transition-all duration-200'
                  )}
                />
                <p className="text-xs text-white/40 mt-2">
                  用于连接后端服务的认证令牌
                </p>
              </div>

              {/* WebSocket URL (readonly info) */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  服务器地址
                </label>
                <div className="px-4 py-3 rounded-lg bg-white/5 text-white/50 text-sm">
                  ws://localhost:8765/ws
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSettings(false)}
                className={cn(
                  'flex-1 px-4 py-2 rounded-lg',
                  'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white',
                  'transition-colors duration-200'
                )}
              >
                取消
              </button>
              <button
                onClick={handleSaveToken}
                className={cn(
                  'flex-1 px-4 py-2 rounded-lg',
                  'bg-primary-500 text-white hover:bg-primary-600',
                  'transition-colors duration-200'
                )}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
