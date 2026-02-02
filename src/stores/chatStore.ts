import { create } from 'zustand';
import type { Character, PipelineStage } from '@/utils/websocket';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contentJp?: string;
  emotion?: string;
  timestamp: Date;
  isPartial?: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type VoiceMode = 'idle' | 'push-to-talk' | 'voice_call';

interface ChatState {
  // Connection
  connectionStatus: ConnectionStatus;
  errorMessage: string | null;
  apiToken: string;
  
  // WebSocket - shared instance
  ws: WebSocket | null;
  setWs: (ws: WebSocket | null) => void;
  
  // Character
  currentCharacter: Character | null;
  characters: Character[];
  
  // Messages
  messages: ChatMessage[];
  partialTranscription: string;
  
  // Pipeline
  pipelineStage: PipelineStage;
  isThinking: boolean;
  
  // Voice
  voiceMode: VoiceMode;
  isRecording: boolean;
  isPlaying: boolean;
  volumeLevel: number;
  /** Shared ref updated every frame by audio player; lip sync reads this to avoid React batching lag. */
  volumeLevelRef: { current: number };
  
  // Theme
  isDarkMode: boolean;
  
  // Actions
  setConnectionStatus: (status: ConnectionStatus) => void;
  setErrorMessage: (message: string | null) => void;
  setApiToken: (token: string) => void;
  setCurrentCharacter: (character: Character | null) => void;
  setCharacters: (characters: Character[]) => void;
  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (content: string, isPartial?: boolean) => void;
  setPartialTranscription: (text: string) => void;
  setPipelineStage: (stage: PipelineStage) => void;
  setIsThinking: (thinking: boolean) => void;
  setVoiceMode: (mode: VoiceMode) => void;
  setIsRecording: (recording: boolean) => void;
  setIsPlaying: (playing: boolean) => void;
  setVolumeLevel: (level: number) => void;
  toggleDarkMode: () => void;
  clearMessages: () => void;
  reset: () => void;
}

const initialState = {
  connectionStatus: 'disconnected' as ConnectionStatus,
  errorMessage: null,
  apiToken: localStorage.getItem('apiToken') || '',
  ws: null as WebSocket | null,
  currentCharacter: null,
  characters: [],
  messages: [],
  partialTranscription: '',
  pipelineStage: 'idle' as PipelineStage,
  isThinking: false,
  voiceMode: 'idle' as VoiceMode,
  isRecording: false,
  isPlaying: false,
  volumeLevel: 0,
  volumeLevelRef: { current: 0 },
  isDarkMode: localStorage.getItem('darkMode') !== 'false',
};

export const useChatStore = create<ChatState>((set) => ({
  ...initialState,

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setErrorMessage: (message) => set({ errorMessage: message }),
  setApiToken: (token) => {
    localStorage.setItem('apiToken', token);
    set({ apiToken: token });
  },
  setWs: (ws) => set({ ws }),
  setCurrentCharacter: (character) => set({ currentCharacter: character }),
  setCharacters: (characters) => set({ characters }),
  
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
    
  updateLastMessage: (content, isPartial = false) =>
    set((state) => {
      const messages = [...state.messages];
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        messages[messages.length - 1] = {
          ...lastMessage,
          content,
          isPartial,
        };
      }
      return { messages };
    }),
    
  setPartialTranscription: (text) => set({ partialTranscription: text }),
  setPipelineStage: (stage) => set({ pipelineStage: stage }),
  setIsThinking: (thinking) => set({ isThinking: thinking }),
  setVoiceMode: (mode) => set({ voiceMode: mode }),
  setIsRecording: (recording) => set({ isRecording: recording }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setVolumeLevel: (level) => set({ volumeLevel: level }),
  
  toggleDarkMode: () =>
    set((state) => {
      const newDarkMode = !state.isDarkMode;
      localStorage.setItem('darkMode', String(newDarkMode));
      return { isDarkMode: newDarkMode };
    }),
    
  clearMessages: () => set({ messages: [], partialTranscription: '' }),
  
  reset: () => set((state) => {
    state.volumeLevelRef.current = 0;
    return { ...initialState };
  }),
}));
