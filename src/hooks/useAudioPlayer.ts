import { useCallback, useRef, useEffect } from 'react';
import { base64ToInt16, createAudioBuffer, AUDIO_CONFIG } from '@/utils/audio';
import { useChatStore } from '@/stores/chatStore';
import type { ServerMessage } from '@/utils/websocket';

export interface AudioPlayerOptions {
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onVolumeChange?: (volume: number) => void;
}

export function useAudioPlayer(
  options: AudioPlayerOptions = {}
) {
  const { onPlaybackStart, onPlaybackEnd, onVolumeChange } = options;
  
  // Use selectors to avoid subscribing to entire store
  const ws = useChatStore((state) => state.ws);
  const setIsPlaying = useChatStore((state) => state.setIsPlaying);
  const setVolumeLevel = useChatStore((state) => state.setVolumeLevel);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize audio context
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({
        sampleRate: AUDIO_CONFIG.sampleRate,
      });
      
      // Create analyser for volume visualization
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(audioContextRef.current.destination);
      analyserRef.current = analyser;
    }
    
    // Resume if suspended
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    
    return audioContextRef.current;
  }, []);

  // Volume monitoring
  const startVolumeMonitoring = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateVolume = () => {
      if (!isPlayingRef.current) {
        setVolumeLevel(0);
        return;
      }

      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      const volume = average / 255;
      
      setVolumeLevel(volume);
      onVolumeChange?.(volume);

      animationFrameRef.current = requestAnimationFrame(updateVolume);
    };

    updateVolume();
  }, [setVolumeLevel, onVolumeChange]);

  // Stop volume monitoring
  const stopVolumeMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setVolumeLevel(0);
  }, [setVolumeLevel]);

  // Play next audio in queue
  const playNextInQueue = useCallback(() => {
    const audioContext = audioContextRef.current;
    const analyser = analyserRef.current;
    
    if (!audioContext || !analyser || audioQueueRef.current.length === 0) {
      if (isPlayingRef.current) {
        isPlayingRef.current = false;
        setIsPlaying(false);
        stopVolumeMonitoring();
        onPlaybackEnd?.();
      }
      return;
    }

    const buffer = audioQueueRef.current.shift()!;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    
    // Connect through analyser
    source.connect(analyser);
    
    currentSourceRef.current = source;

    // Calculate start time for gapless playback
    const now = audioContext.currentTime;
    const startTime = Math.max(nextStartTimeRef.current, now);
    nextStartTimeRef.current = startTime + buffer.duration;

    source.onended = () => {
      currentSourceRef.current = null;
      playNextInQueue();
    };

    source.start(startTime);

    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
      setIsPlaying(true);
      startVolumeMonitoring();
      onPlaybackStart?.();
    }
  }, [setIsPlaying, onPlaybackStart, onPlaybackEnd, startVolumeMonitoring, stopVolumeMonitoring]);

  // Add audio chunk to queue
  const addAudioChunk = useCallback((base64Data: string, sampleRate: number = AUDIO_CONFIG.sampleRate) => {
    const audioContext = getAudioContext();
    
    try {
      const int16Data = base64ToInt16(base64Data);
      const audioBuffer = createAudioBuffer(audioContext, int16Data, sampleRate);
      audioQueueRef.current.push(audioBuffer);

      // Start playing if not already
      if (!isPlayingRef.current && audioQueueRef.current.length > 0) {
        nextStartTimeRef.current = audioContext.currentTime;
        playNextInQueue();
      }
    } catch (error) {
      console.error('Failed to decode audio chunk:', error);
    }
  }, [getAudioContext, playNextInQueue]);

  // Stop playback
  const stopPlayback = useCallback(() => {
    // Clear queue
    audioQueueRef.current = [];

    // Stop current source
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // Ignore errors if already stopped
      }
      currentSourceRef.current = null;
    }

    isPlayingRef.current = false;
    setIsPlaying(false);
    stopVolumeMonitoring();
    onPlaybackEnd?.();
  }, [setIsPlaying, stopVolumeMonitoring, onPlaybackEnd]);

  // Handle WebSocket messages for audio
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'audio_chunk':
            addAudioChunk(message.audio_base64, message.audio_sample_rate);
            break;

          case 'audio_end':
            // Audio stream ended, let queue finish playing
            break;
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.addEventListener('message', handleMessage);

    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws, addAudioChunk]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stopPlayback]);

  return {
    addAudioChunk,
    stopPlayback,
    isPlaying: isPlayingRef.current,
  };
}
