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
  
  const {
    apiToken,
    connectionStatus,
    ws,
    setWs,
    setConnectionStatus,
    setErrorMessage,
    setCurrentCharacter,
    setCharacters,
    addMessage,
    setPartialTranscription,
    setPipelineStage,
    setIsThinking,
    setIsPlaying,
    clearMessages,
  } = useChatStore();

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

  // Send message through WebSocket - uses store's ws directly
  const sendMessage = useCallback((message: ClientMessage) => {
    // Get the current WebSocket from store
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
          // Add user message with recognized text
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
          // LLM processing complete
          break;

        case 'tts_start':
          setPipelineStage('tts');
          // Store emotion for Live2D
          useChatStore.getState().setIsThinking(false);
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
          // Audio chunks are handled by useAudioPlayer
          break;

        case 'audio_end':
          setIsPlaying(false);
          setPipelineStage('idle');
          break;

        case 'response':
          setIsThinking(false);
          setPipelineStage('idle');
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: message.content_cn,
            contentJp: message.content_jp,
            emotion: message.emotion,
            timestamp: new Date(),
          });
          break;

        case 'audio_stream_started':
          // Audio streaming started
          break;

        case 'agent_listening':
          // Agent is ready to listen
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
          // Heartbeat response
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
    // Get current state from store
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
      // Send connect message directly through the new WebSocket
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

      // Clear ping interval
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      // Auto reconnect if was connected
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

  // Cleanup on unmount - only cleanup intervals, not the WebSocket itself
  // The WebSocket is shared, so we don't want to close it when one component unmounts
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

  // Message handler ref for audio player
  const addMessageHandler = useCallback((handler: (event: MessageEvent) => void) => {
    const currentWs = useChatStore.getState().ws;
    if (currentWs) {
      const originalHandler = currentWs.onmessage;
      currentWs.onmessage = (event) => {
        if (originalHandler) {
          (originalHandler as (event: MessageEvent) => void)(event);
        }
        handler(event);
      };
    }
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
    addMessageHandler,
    ws,
  };
}
