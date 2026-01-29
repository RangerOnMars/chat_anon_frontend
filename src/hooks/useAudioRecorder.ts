import { useCallback, useRef, useState } from 'react';
import {
  AUDIO_CONFIG,
  float32ToInt16,
  int16ToBase64,
  resampleAudio,
  calculateRMS,
  normalizeVolume,
} from '@/utils/audio';
import { useChatStore } from '@/stores/chatStore';

export interface AudioRecorderOptions {
  onChunk?: (base64Data: string) => void;
  onVolumeChange?: (volume: number) => void;
  chunkIntervalMs?: number;
}

export function useAudioRecorder(options: AudioRecorderOptions = {}) {
  const { onChunk, onVolumeChange, chunkIntervalMs = 100 } = options;
  
  const { setIsRecording, setVolumeLevel } = useChatStore();
  
  const [isSupported, setIsSupported] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Int16Array[]>([]);
  const isRecordingRef = useRef(false);
  const chunkIntervalRef = useRef<number | null>(null);
  const accumulatedSamplesRef = useRef<Float32Array[]>([]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      // Check browser support
      if (!navigator.mediaDevices?.getUserMedia) {
        setIsSupported(false);
        throw new Error('Browser does not support audio recording');
      }

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: AUDIO_CONFIG.sampleRate,
          channelCount: AUDIO_CONFIG.channelCount,
        },
      });

      streamRef.current = stream;
      setPermissionDenied(false);

      // Create audio context
      const audioContext = new AudioContext({
        sampleRate: AUDIO_CONFIG.sampleRate,
      });
      audioContextRef.current = audioContext;

      // Create source from stream
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Create processor for raw PCM data
      // Note: ScriptProcessorNode is deprecated but works reliably
      // AudioWorklet is the modern alternative but requires more setup
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Clear previous data
      chunksRef.current = [];
      accumulatedSamplesRef.current = [];
      isRecordingRef.current = true;

      processor.onaudioprocess = (event) => {
        if (!isRecordingRef.current) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const float32Data = new Float32Array(inputData);

        // Calculate volume for visualization
        const rms = calculateRMS(float32Data);
        const volume = normalizeVolume(rms);
        setVolumeLevel(volume);
        onVolumeChange?.(volume);

        // Resample if needed
        const resampled = resampleAudio(
          float32Data,
          audioContext.sampleRate,
          AUDIO_CONFIG.sampleRate
        );

        // Accumulate samples for chunks
        accumulatedSamplesRef.current.push(resampled);

        // Convert to Int16 and store
        const int16Data = float32ToInt16(resampled);
        chunksRef.current.push(int16Data);
      };

      // Connect nodes
      source.connect(processor);
      processor.connect(audioContext.destination);

      // Start chunk sending interval (for streaming modes)
      if (onChunk) {
        chunkIntervalRef.current = window.setInterval(() => {
          if (accumulatedSamplesRef.current.length > 0) {
            // Merge accumulated samples
            const totalLength = accumulatedSamplesRef.current.reduce(
              (sum, arr) => sum + arr.length,
              0
            );
            const merged = new Float32Array(totalLength);
            let offset = 0;
            for (const arr of accumulatedSamplesRef.current) {
              merged.set(arr, offset);
              offset += arr.length;
            }

            // Convert and send
            const int16Data = float32ToInt16(merged);
            const base64Data = int16ToBase64(int16Data);
            onChunk(base64Data);

            // Clear accumulated samples
            accumulatedSamplesRef.current = [];
          }
        }, chunkIntervalMs);
      }

      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setPermissionDenied(true);
      }
      
      throw error;
    }
  }, [onChunk, onVolumeChange, chunkIntervalMs, setIsRecording, setVolumeLevel]);

  // Stop recording and return complete audio data
  const stopRecording = useCallback((): string => {
    isRecordingRef.current = false;

    // Clear chunk interval
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    // Disconnect and close audio nodes
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Merge all chunks into single buffer
    const totalLength = chunksRef.current.reduce((sum, arr) => sum + arr.length, 0);
    const mergedData = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of chunksRef.current) {
      mergedData.set(chunk, offset);
      offset += chunk.length;
    }

    // Clear chunks
    chunksRef.current = [];
    accumulatedSamplesRef.current = [];

    // Reset volume
    setVolumeLevel(0);

    setIsRecording(false);

    // Return base64 encoded audio
    return int16ToBase64(mergedData);
  }, [setIsRecording, setVolumeLevel]);

  // Cancel recording without returning data
  const cancelRecording = useCallback(() => {
    isRecordingRef.current = false;

    // Clear chunk interval
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    // Disconnect and close audio nodes
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Clear chunks
    chunksRef.current = [];
    accumulatedSamplesRef.current = [];

    // Reset volume
    setVolumeLevel(0);

    setIsRecording(false);
  }, [setIsRecording, setVolumeLevel]);

  return {
    startRecording,
    stopRecording,
    cancelRecording,
    isSupported,
    permissionDenied,
  };
}
