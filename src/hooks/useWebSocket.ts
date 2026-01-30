import { useCallback, useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import type {
  ClientMessage,
  ServerMessage,
  CharactersResponse,
} from '@/utils/websocket';

const WS_URL = 'ws://localhost:8765/ws';
const API_URL = 'http://localhost:8765';
const PING_INTERVAL = 30000; // 30 seconds
const RECONNECT_DELAY = 3000; // 3 seconds

export function useWebSocket() {
  const pingIntervalRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  
  // Use selectors to only subscribe to specific state values we need for rendering
  // Actions (setters) are always stable and don't cause re-renders
  const setCharacters = useChatStore((state) => state.setCharacters);
  const setConnectionStatus = useChatStore((state) => state.setConnectionStatus);
  const setErrorMessage = useChatStore((state) => state.setErrorMessage);
  const setCurrentCharacter = useChatStore((state) => state.setCurrentCharacter);
  const setWs = useChatStore((state) => state.setWs);
  const addMessage = useChatStore((state) => state.addMessage);
  const setPartialTranscription = useChatStore((state) => state.setPartialTranscription);
  const setPipelineStage = useChatStore((state) => state.setPipelineStage);
  const setIsThinking = useChatStore((state) => state.setIsThinking);
  const setIsPlaying = useChatStore((state) => state.setIsPlaying);
  const clearMessages = useChatStore((state) => state.clearMessages);

  // Fetch available characters
  const fetchCharacters = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/characters`);
      if (response.ok) {
        const data: CharactersResponse = await response.json();
        setCharacters(data.characters);
        return data.characters;
      }
    } catch (error) {
      console.error('Failed to fetch characters:', error);
    }
    return [];
  }, [setCharacters]);

  // Send message through WebSocket - uses store's ws directly via getState()
  const sendMessage = useCallback((message: ClientMessage) => {
    const currentWs = useChatStore.getState().ws;
    if (currentWs?.readyState === WebSocket.OPEN) {
      currentWs.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: ServerMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'connected':
          setConnectionStatus('connected');
          setCurrentCharacter({
            name: message.character,
            display_name: message.character_display_name,
            description: '',
            voice_id: '',
          });
          setErrorMessage(null);
          break;

        case 'disconnected':
          setConnectionStatus('disconnected');
          setErrorMessage(message.message);
          break;

        case 'thinking':
          setIsThinking(true);
          setPipelineStage('idle');
          break;

        case 'asr_start':
          setPipelineStage('asr');
          break;

        case 'asr_end':
          setPartialTranscription('');
          addMessage({
            id: crypto.randomUUID(),
            role: 'user',
            content: message.text,
            timestamp: new Date(),
          });
          break;

        case 'llm_start':
          setPipelineStage('llm');
          break;

        case 'llm_end':
          break;

        case 'tts_start':
          setPipelineStage('tts');
          setIsThinking(false);
          break;

        case 'transcription':
          if (message.is_partial) {
            setPartialTranscription(message.text);
          } else {
            setPartialTranscription('');
          }
          break;

        case 'audio_chunk':
          setPipelineStage('playing');
          setIsPlaying(true);
          break;

        case 'audio_end':
          // Stream ended; do NOT set isPlaying(false) here - playback may still be
          // draining the queue. useAudioPlayer will set isPlaying(false) and
          // pipelineStage when the queue actually finishes (checkPlaybackEnded).
          break;

        case 'response':
          // Per-sentence response (multi-sentence TTS: one response per sentence).
          // Only add message; do NOT set pipeline to idle here — wait for turn_end.
          setIsThinking(false);
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: message.content_cn,
            contentJp: message.content_jp,
            emotion: message.emotion,
            timestamp: new Date(),
          });
          break;

        case 'turn_end':
          // Turn complete (all sentences sent). Idle pipeline; playback may still be draining.
          setIsThinking(false);
          setPipelineStage('idle');
          break;

        case 'audio_stream_started':
          break;

        case 'agent_listening':
          setPipelineStage('idle');
          setIsThinking(false);
          break;

        case 'character_switched':
          setCurrentCharacter({
            name: message.character,
            display_name: message.character_display_name,
            description: '',
            voice_id: '',
          });
          clearMessages();
          break;

        case 'history_cleared':
          clearMessages();
          break;

        case 'pong':
          break;

        case 'error':
          setErrorMessage(message.message);
          setIsThinking(false);
          setPipelineStage('idle');
          break;
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }, [
    setConnectionStatus,
    setCurrentCharacter,
    setErrorMessage,
    setIsThinking,
    setPipelineStage,
    setPartialTranscription,
    addMessage,
    setIsPlaying,
    clearMessages,
  ]);

  // Connect to WebSocket
  const connect = useCallback((characterName: string = 'anon') => {
    const currentWs = useChatStore.getState().ws;
    const currentToken = useChatStore.getState().apiToken;
    
    if (currentWs?.readyState === WebSocket.OPEN) {
      return;
    }

    if (!currentToken) {
      setErrorMessage('请输入 API Token');
      return;
    }

    setConnectionStatus('connecting');
    setErrorMessage(null);

    const newWs = new WebSocket(WS_URL);
    setWs(newWs);

    newWs.onopen = () => {
      newWs.send(JSON.stringify({
        type: 'connect',
        api_token: currentToken,
        character_name: characterName,
      }));

      // Start ping interval
      pingIntervalRef.current = window.setInterval(() => {
        const ws = useChatStore.getState().ws;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL);
    };

    newWs.onmessage = handleMessage;

    newWs.onerror = () => {
      setConnectionStatus('error');
      setErrorMessage('连接错误');
    };

    newWs.onclose = () => {
      setConnectionStatus('disconnected');
      setWs(null);

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      // Auto reconnect only if was previously connected
      const status = useChatStore.getState().connectionStatus;
      if (status === 'connected') {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect(characterName);
        }, RECONNECT_DELAY);
      }
    };
  }, [handleMessage, setConnectionStatus, setErrorMessage, setWs]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    const currentWs = useChatStore.getState().ws;
    if (currentWs) {
      currentWs.close();
      setWs(null);
    }

    setConnectionStatus('disconnected');
  }, [setConnectionStatus, setWs]);

  // Send text message
  const sendTextMessage = useCallback((content: string) => {
    if (!content.trim()) return;
    
    addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    });
    
    sendMessage({
      type: 'message',
      content,
    });
  }, [addMessage, sendMessage]);

  // Send audio message (batch)
  const sendAudioMessage = useCallback((audioBase64: string) => {
    sendMessage({
      type: 'audio_message',
      audio_base64: audioBase64,
    });
  }, [sendMessage]);

  // Streaming audio
  const startAudioStream = useCallback(() => {
    sendMessage({ type: 'audio_stream_start' });
  }, [sendMessage]);

  const sendAudioStreamChunk = useCallback((audioBase64: string) => {
    sendMessage({
      type: 'audio_stream_chunk',
      audio_base64: audioBase64,
    });
  }, [sendMessage]);

  const endAudioStream = useCallback(() => {
    sendMessage({ type: 'audio_stream_end' });
  }, [sendMessage]);

  // Agent mode
  const startAgentMode = useCallback(() => {
    sendMessage({ type: 'agent_mode_start' });
  }, [sendMessage]);

  const sendAgentAudioChunk = useCallback((audioBase64: string) => {
    sendMessage({
      type: 'agent_audio_chunk',
      audio_base64: audioBase64,
    });
  }, [sendMessage]);

  const stopAgentMode = useCallback(() => {
    sendMessage({ type: 'agent_mode_stop' });
  }, [sendMessage]);

  // Switch character
  const switchCharacter = useCallback((characterName: string) => {
    sendMessage({
      type: 'switch_character',
      character_name: characterName,
    });
  }, [sendMessage]);

  // Clear history
  const clearHistory = useCallback(() => {
    sendMessage({ type: 'clear_history' });
  }, [sendMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, []);

  return {
    connect,
    disconnect,
    sendTextMessage,
    sendAudioMessage,
    startAudioStream,
    sendAudioStreamChunk,
    endAudioStream,
    startAgentMode,
    sendAgentAudioChunk,
    stopAgentMode,
    switchCharacter,
    clearHistory,
    fetchCharacters,
  };
}
