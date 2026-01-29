import { useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { Header } from '@/components/Header';
import { Live2DCanvas } from '@/components/Live2DCanvas';
import { ChatPanel } from '@/components/ChatPanel';
import { VoiceControls } from '@/components/VoiceControls';
import { StatusIndicator } from '@/components/StatusIndicator';
import { cn } from '@/utils/cn';

function App() {
  const { isDarkMode, errorMessage, setErrorMessage } = useChatStore();
  const { wsRef, fetchCharacters } = useWebSocket();
  
  // Initialize audio player
  useAudioPlayer(wsRef);

  // Fetch characters on mount
  useEffect(() => {
    fetchCharacters();
  }, [fetchCharacters]);

  // Apply dark mode class to html element
  useEffect(() => {
    document.documentElement.classList.toggle('light', !isDarkMode);
  }, [isDarkMode]);

  // Auto dismiss error after 5 seconds
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage, setErrorMessage]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
        {/* Left: Live2D Model */}
        <div className="w-full lg:w-3/5 h-[40vh] lg:h-full flex flex-col gap-4">
          <div className="flex-1 min-h-0">
            <Live2DCanvas />
          </div>
          
          {/* Status Indicator (Desktop) */}
          <div className="hidden lg:block">
            <StatusIndicator />
          </div>
        </div>

        {/* Right: Chat Panel */}
        <div className="w-full lg:w-2/5 flex-1 lg:h-full flex flex-col gap-4 min-h-0">
          <div className="flex-1 min-h-0">
            <ChatPanel />
          </div>
          
          {/* Voice Controls */}
          <div className="glass rounded-xl">
            <VoiceControls />
          </div>

          {/* Status Indicator (Mobile) */}
          <div className="lg:hidden">
            <StatusIndicator />
          </div>
        </div>
      </main>

      {/* Error Toast */}
      {errorMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
          <div
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg',
              'bg-red-500/90 text-white',
              'shadow-lg backdrop-blur-sm'
            )}
          >
            <span className="text-sm">{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:bg-white/20 rounded transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Background Gradient */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl" />
      </div>
    </div>
  );
}

export default App;
