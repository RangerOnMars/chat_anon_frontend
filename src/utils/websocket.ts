// WebSocket Message Types

// ============ Client -> Server Messages ============

export interface ConnectMessage {
  type: 'connect';
  api_token: string;
  character_name: string;
}

export interface TextMessage {
  type: 'message';
  content: string;
}

export interface AudioMessage {
  type: 'audio_message';
  audio_base64: string;
}

export interface AudioStreamStartMessage {
  type: 'audio_stream_start';
}

export interface AudioStreamChunkMessage {
  type: 'audio_stream_chunk';
  audio_base64: string;
}

export interface AudioStreamEndMessage {
  type: 'audio_stream_end';
}

export interface VoiceCallStartMessage {
  type: 'voice_call_start';
}

export interface VoiceCallAudioChunkMessage {
  type: 'voice_call_audio_chunk';
  audio_base64: string;
}

export interface VoiceCallStopMessage {
  type: 'voice_call_stop';
}

export interface SwitchCharacterMessage {
  type: 'switch_character';
  character_name: string;
}

export interface ClearHistoryMessage {
  type: 'clear_history';
}

export interface PingMessage {
  type: 'ping';
}

export type ClientMessage =
  | ConnectMessage
  | TextMessage
  | AudioMessage
  | AudioStreamStartMessage
  | AudioStreamChunkMessage
  | AudioStreamEndMessage
  | VoiceCallStartMessage
  | VoiceCallAudioChunkMessage
  | VoiceCallStopMessage
  | SwitchCharacterMessage
  | ClearHistoryMessage
  | PingMessage;

// ============ Server -> Client Messages ============

export interface ConnectedMessage {
  type: 'connected';
  character: string;
  character_display_name: string;
  message: string;
}

export interface DisconnectedMessage {
  type: 'disconnected';
  reason: string;
  message: string;
}

export interface ThinkingMessage {
  type: 'thinking';
  message: string;
}

export interface AsrStartMessage {
  type: 'asr_start';
}

export interface AsrEndMessage {
  type: 'asr_end';
  text: string;
}

export interface LlmStartMessage {
  type: 'llm_start';
}

export interface LlmEndMessage {
  type: 'llm_end';
  elapsed_time: number;
}

export interface TtsStartMessage {
  type: 'tts_start';
  text: string;
  emotion: string;
}

export interface TranscriptionMessage {
  type: 'transcription';
  text: string;
  is_partial: boolean;
}

export interface AudioChunkMessage {
  type: 'audio_chunk';
  audio_base64: string;
  audio_format: string;
  audio_sample_rate: number;
}

export interface AudioEndMessage {
  type: 'audio_end';
}

export interface ResponseMessage {
  type: 'response';
  content_cn: string;
  content_jp: string;
  emotion: string;
  audio_format?: string;
  audio_sample_rate?: number;
}

/** Sent after all sentences' audio has been sent (after audio_end). Client should treat turn as complete. */
export interface TurnEndMessage {
  type: 'turn_end';
}

export interface AudioStreamStartedMessage {
  type: 'audio_stream_started';
  message: string;
}

export interface VoiceCallListeningMessage {
  type: 'voice_call_listening';
  message?: string;
}

export interface CharacterSwitchedMessage {
  type: 'character_switched';
  character: string;
  character_display_name: string;
  message: string;
}

export interface HistoryClearedMessage {
  type: 'history_cleared';
  message: string;
}

export interface PongMessage {
  type: 'pong';
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type ServerMessage =
  | ConnectedMessage
  | DisconnectedMessage
  | ThinkingMessage
  | AsrStartMessage
  | AsrEndMessage
  | LlmStartMessage
  | LlmEndMessage
  | TtsStartMessage
  | TranscriptionMessage
  | AudioChunkMessage
  | AudioEndMessage
  | ResponseMessage
  | TurnEndMessage
  | AudioStreamStartedMessage
  | VoiceCallListeningMessage
  | CharacterSwitchedMessage
  | HistoryClearedMessage
  | PongMessage
  | ErrorMessage;

// ============ Data Models ============

export interface Character {
  name: string;
  display_name: string;
  description: string;
  voice_id: string;
  /** Default Live2D model set under live2d/{name}/{live2d_model_set}/ (optional, from GET /characters). */
  live2d_model_set?: string;
}

export interface CharactersResponse {
  characters: Character[];
}

export interface ServerInfo {
  name: string;
  version: string;
  status: string;
  active_connections: number;
}

// ============ Pipeline States ============

export type PipelineStage = 'idle' | 'asr' | 'llm' | 'tts' | 'playing';

export interface PipelineState {
  stage: PipelineStage;
  asrText?: string;
  llmElapsedTime?: number;
  ttsEmotion?: string;
}
