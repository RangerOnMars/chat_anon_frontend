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
  const setPipelineStage = useChatStore((state) => state.setPipelineStage);
  const setVolumeLevel = useChatStore((state) => state.setVolumeLevel);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(false);
  const nextStartTimeRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const lastScheduledEndTimeRef = useRef(0);
  const playbackCheckIntervalRef = useRef<number | null>(null);
  /** True after audio_end received; playback is "done" only when stream ended AND queue drained */
  const streamEndedRef = useRef(false);

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
      
      // Reset scheduling state
      nextStartTimeRef.current = 0;
      lastScheduledEndTimeRef.current = 0;
      scheduledSourcesRef.current = [];
    }
    
    // Resume if suspended
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    
    return audioContextRef.current;
  }, []);

  // Volume monitoring: RMS from time domain (matches Python WavHandler.GetRms() for lip sync)
  const startVolumeMonitoring = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const timeData = new Uint8Array(analyser.fftSize);

    const updateVolume = () => {
      if (!isPlayingRef.current) {
        setVolumeLevel(0);
        return;
      }

      analyser.getByteTimeDomainData(timeData);

      // RMS: sample_i = (v - 128) / 128, rms = sqrt(mean(sample_i^2))
      let sumSq = 0;
      for (let i = 0; i < timeData.length; i++) {
        const sample = (timeData[i] - 128) / 128;
        sumSq += sample * sample;
      }
      const rms = Math.sqrt(sumSq / timeData.length);
      const volume = Math.min(1, rms * 2);

      // Write to shared ref every frame so lip sync reads latest without depending on React re-renders
      useChatStore.getState().volumeLevelRef.current = volume;

      // #region agent log
      if (Math.random() < 0.02) fetch('http://127.0.0.1:7243/ingest/f4c89dae-c5c6-4ddf-83b3-ea85c173d520',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAudioPlayer.ts:updateVolume',message:'RMS/volume',data:{rms,volume},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
      if (typeof (window as unknown as { __lipSyncFrame?: number }).__lipSyncFrame === 'undefined') (window as unknown as { __lipSyncFrame: number }).__lipSyncFrame = 0;
      const w = window as unknown as { __lipSyncFrame: number };
      w.__lipSyncFrame++;
      if (w.__lipSyncFrame % 60 === 0) console.debug('[LipSync] player', { frame: w.__lipSyncFrame, rms, volume });
      // #endregion

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
    useChatStore.getState().volumeLevelRef.current = 0;
    setVolumeLevel(0);
  }, [setVolumeLevel]);

  // Check if playback has ended (only after stream ended AND queue drained)
  const checkPlaybackEnded = useCallback(() => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;
    
    // Require streamEnded (audio_end received) so we don't flicker off during chunk gaps
    if (!streamEndedRef.current) return;
    // If current time has passed the last scheduled end time, playback is done
    if (isPlayingRef.current && audioContext.currentTime >= lastScheduledEndTimeRef.current) {
      // Clean up finished sources
      scheduledSourcesRef.current = [];
      isPlayingRef.current = false;
      setIsPlaying(false);
      setPipelineStage('idle');
      stopVolumeMonitoring();
      onPlaybackEnd?.();
      
      // Clear the check interval
      if (playbackCheckIntervalRef.current) {
        clearInterval(playbackCheckIntervalRef.current);
        playbackCheckIntervalRef.current = null;
      }
    }
  }, [setIsPlaying, setPipelineStage, stopVolumeMonitoring, onPlaybackEnd]);

  // Schedule audio buffer for playback (pre-scheduling approach)
  const scheduleBuffer = useCallback((buffer: AudioBuffer) => {
    const audioContext = audioContextRef.current;
    const analyser = analyserRef.current;
    
    if (!audioContext || !analyser) return;

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    
    // Calculate start time - use last scheduled end time or current time
    const now = audioContext.currentTime;
    const startTime = Math.max(lastScheduledEndTimeRef.current, now);
    
    // Update the last scheduled end time
    lastScheduledEndTimeRef.current = startTime + buffer.duration;

    // Schedule the buffer to start at the calculated time
    source.start(startTime);
    
    // Keep track of scheduled sources for cleanup
    scheduledSourcesRef.current.push(source);
    
    // Clean up old sources that have finished playing
    source.onended = () => {
      const index = scheduledSourcesRef.current.indexOf(source);
      if (index > -1) {
        scheduledSourcesRef.current.splice(index, 1);
      }
    };
  }, []);

  // Add audio chunk - immediately schedule for playback
  const addAudioChunk = useCallback((base64Data: string, sampleRate: number = AUDIO_CONFIG.sampleRate) => {
    const audioContext = getAudioContext();
    
    try {
      const int16Data = base64ToInt16(base64Data);
      const audioBuffer = createAudioBuffer(audioContext, int16Data, sampleRate);
      
      // Immediately schedule this buffer for playback
      scheduleBuffer(audioBuffer);

      // Start playback state tracking if not already
      if (!isPlayingRef.current) {
        isPlayingRef.current = true;
        setIsPlaying(true);
        startVolumeMonitoring();
        onPlaybackStart?.();
        
        // Start periodic check for playback completion
        if (!playbackCheckIntervalRef.current) {
          playbackCheckIntervalRef.current = window.setInterval(checkPlaybackEnded, 100);
        }
      }
    } catch (error) {
      console.error('Failed to decode audio chunk:', error);
    }
  }, [getAudioContext, scheduleBuffer, setIsPlaying, startVolumeMonitoring, onPlaybackStart, checkPlaybackEnded]);

  // Stop playback
  const stopPlayback = useCallback(() => {
    // Stop all scheduled sources
    for (const source of scheduledSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Ignore errors if already stopped
      }
    }
    scheduledSourcesRef.current = [];
    
    // Clear playback check interval
    if (playbackCheckIntervalRef.current) {
      clearInterval(playbackCheckIntervalRef.current);
      playbackCheckIntervalRef.current = null;
    }
    
    // Reset scheduling state
    lastScheduledEndTimeRef.current = 0;
    streamEndedRef.current = false;

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
          case 'llm_start':
            // New turn: reset scheduling so first sentence's chunks start from current time.
            // Do NOT reset on tts_start — multi-sentence sends one tts_start per sentence;
            // resetting there would make sentence 2+ start at "now" and overlap with previous.
            lastScheduledEndTimeRef.current = 0;
            streamEndedRef.current = false;
            break;

          case 'tts_start':
            // Pre-initialize AudioContext when TTS starts to reduce latency on first chunk
            getAudioContext();
            break;

          case 'audio_chunk':
            addAudioChunk(message.audio_base64, message.audio_sample_rate);
            break;

          case 'audio_end':
            // Stream finished sending; playback ends only when queue drains (checkPlaybackEnded)
            streamEndedRef.current = true;
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
  }, [ws, addAudioChunk, getAudioContext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
      if (playbackCheckIntervalRef.current) {
        clearInterval(playbackCheckIntervalRef.current);
        playbackCheckIntervalRef.current = null;
      }
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
