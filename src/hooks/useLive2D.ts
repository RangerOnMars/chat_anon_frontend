import { useCallback, useRef, useEffect, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display';

// Register Live2D with PIXI
window.PIXI = PIXI;

/** Patch display object and all descendants for Pixi v7 EventBoundary (isInteractive). */
function patchPixiV7Interaction(obj: unknown): void {
  const o = obj as Record<string, unknown>;
  if (typeof o.isInteractive !== 'function') {
    o.isInteractive = () => false;
  }
  const children = o.children as unknown[] | undefined;
  if (Array.isArray(children)) {
    for (const child of children) {
      patchPixiV7Interaction(child);
    }
  }
}

// Emotion to motion mapping based on the model's motion groups
const emotionMotionMap: Record<string, { group: string; indices: number[] }> = {
  happy: { group: 'rana', indices: [0, 1, 2, 3] }, // smile motions
  sad: { group: 'rana', indices: [4, 5] }, // sad motions
  angry: { group: 'rana', indices: [6, 7, 8, 9] }, // angry motions
  surprised: { group: 'rana', indices: [10] }, // surprised
  thinking: { group: 'rana', indices: [11, 12, 13] }, // thinking
  idle: { group: 'idle', indices: [0] }, // default idle
  shame: { group: 'rana', indices: [14, 15] }, // shame
  cry: { group: 'rana', indices: [16, 17] }, // cry
};

// Expression mapping
const emotionExpressionMap: Record<string, string> = {
  happy: 'smile01',
  sad: 'sad01',
  angry: 'angry01',
  surprised: 'surprised01',
  thinking: 'thinking01',
  idle: 'idle01',
  shame: 'shame01',
  cry: 'cry01',
};

export interface Live2DController {
  playEmotion: (emotion: string) => void;
  playMotion: (group: string, index: number) => void;
  setExpression: (expression: string) => void;
  setLipSync: (value: number) => void;
  startIdleAnimation: () => void;
  stopIdleAnimation: () => void;
}

export function useLive2D(modelPath: string) {
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<Live2DModel | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const idleIntervalRef = useRef<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Initialize PIXI app and load model
  const initialize = useCallback(async (container: HTMLDivElement) => {
    if (appRef.current) return;

    containerRef.current = container;

    try {
      // Yield to browser to allow loading animation to render
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      // Create PIXI application (PIXI v7 API - options in constructor)
      // Cap resolution at 2 to avoid OOM on high-DPI screens (3x/4x can use 2–4GB+)
      const resolution = Math.min(window.devicePixelRatio || 1, 2);
      const app = new PIXI.Application({
        view: document.createElement('canvas'),
        resizeTo: container,
        backgroundAlpha: 0,
        antialias: false, // Disable to reduce GPU memory
        resolution,
        autoDensity: true,
      });

      container.appendChild(app.view as HTMLCanvasElement);
      appRef.current = app;

      // Yield again before loading the model
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Load Live2D model
      const model = await Live2DModel.from(modelPath, {
        autoInteract: false,
        autoUpdate: true,
      });

      modelRef.current = model;

      // Scale and position model
      const scaleX = container.clientWidth / model.width;
      const scaleY = container.clientHeight / model.height;
      const scale = Math.min(scaleX, scaleY) * 0.85;
      
      model.scale.set(scale);
      model.x = container.clientWidth / 2;
      model.y = container.clientHeight / 2 + model.height * scale * 0.1;
      model.anchor.set(0.5, 0.5);

      // Add to stage
      app.stage.addChild(model);

      // Pixi v7 EventBoundary calls isInteractive() on display objects; Live2D objects don't have it. Patch model and all children.
      patchPixiV7Interaction(model);

      // Handle pointer on canvas for focus and click (canvas listeners still work)
      const canvas = app.view as HTMLCanvasElement;
      const onCanvasPointerMove = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        model.focus(x, y);
      };
      const onCanvasClick = () => {
        model.motion('rana', Math.floor(Math.random() * 4));
      };
      canvas.addEventListener('pointermove', onCanvasPointerMove);
      canvas.addEventListener('click', onCanvasClick);
      const modelExt = model as unknown as Record<string, unknown>;
      modelExt._canvasPointerMove = onCanvasPointerMove;
      modelExt._canvasClick = onCanvasClick;
      modelExt._canvasEl = canvas;
      if ('eventMode' in model) modelExt.eventMode = 'none';

      setIsLoaded(true);
      setLoadError(null);

      // Start idle animation after delay to ensure model is ready
      setTimeout(() => {
        startIdleAnimation();
      }, 1000);

    } catch (error) {
      console.error('Failed to load Live2D model:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load model');
      setIsLoaded(false);
    }
  }, [modelPath]);

  // Play emotion animation
  const playEmotion = useCallback((emotion: string) => {
    const model = modelRef.current;
    if (!model) return;

    const mapping = emotionMotionMap[emotion] || emotionMotionMap.idle;
    const randomIndex = mapping.indices[Math.floor(Math.random() * mapping.indices.length)];

    // Play motion
    model.motion(mapping.group, randomIndex);

    // Set expression
    const expression = emotionExpressionMap[emotion];
    if (expression) {
      model.expression(expression);
    }
  }, []);

  // Play specific motion
  const playMotion = useCallback((group: string, index: number) => {
    const model = modelRef.current;
    if (!model) return;
    model.motion(group, index);
  }, []);

  // Set expression
  const setExpression = useCallback((expression: string) => {
    const model = modelRef.current;
    if (!model) return;
    model.expression(expression);
  }, []);

  // Set lip sync value (0-1)
  const setLipSync = useCallback((value: number) => {
    const model = modelRef.current;
    if (!model?.internalModel?.coreModel) return;

    // Set mouth open parameter
    // Parameter names vary by model, common ones are:
    // PARAM_MOUTH_OPEN_Y, ParamMouthOpenY, Mouth_Open, etc.
    const coreModel = model.internalModel.coreModel;
    const paramNames = ['ParamMouthOpenY', 'PARAM_MOUTH_OPEN_Y', 'Mouth_Open'];
    
    for (const paramName of paramNames) {
      try {
        const paramIndex = coreModel.getParameterIndex(paramName);
        if (paramIndex >= 0) {
          coreModel.setParameterValueByIndex(paramIndex, value);
          break;
        }
      } catch {
        // Parameter not found, try next
      }
    }
  }, []);

  // Start idle animation loop
  const startIdleAnimation = useCallback(() => {
    if (idleIntervalRef.current) return;

    idleIntervalRef.current = window.setInterval(() => {
      const model = modelRef.current;
      if (model?.internalModel?.motionManager) {
        try {
          model.motion('idle', Math.floor(Math.random() * 3));
        } catch (error) {
          console.warn('Failed to play idle motion:', error);
        }
      }
    }, 15000);
  }, []);

  // Stop idle animation loop
  const stopIdleAnimation = useCallback(() => {
    if (idleIntervalRef.current) {
      clearInterval(idleIntervalRef.current);
      idleIntervalRef.current = null;
    }
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const app = appRef.current;
      const model = modelRef.current;

      if (container && app && model) {
        app.renderer.resize(container.clientWidth, container.clientHeight);
        
        const scaleX = container.clientWidth / model.width;
        const scaleY = container.clientHeight / model.height;
        const scale = Math.min(scaleX, scaleY) * 0.85;
        
        model.scale.set(scale);
        model.x = container.clientWidth / 2;
        model.y = container.clientHeight / 2 + model.height * scale * 0.1;
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Cleanup: destroy model first to release Live2D textures, then PIXI app
  useEffect(() => {
    return () => {
      stopIdleAnimation();
      const model = modelRef.current;
      if (model) {
        const modelExt = model as unknown as Record<string, unknown>;
        const canvas = modelExt._canvasEl as HTMLCanvasElement | undefined;
        const onMove = modelExt._canvasPointerMove as ((e: MouseEvent) => void) | undefined;
        const onClick = modelExt._canvasClick as (() => void) | undefined;
        if (canvas) {
          if (onMove) canvas.removeEventListener('pointermove', onMove);
          if (onClick) canvas.removeEventListener('click', onClick);
        }
        try {
          if (typeof model.destroy === 'function') model.destroy({ children: true, texture: true });
        } catch (_) {
          // Ignore destroy errors
        }
        modelRef.current = null;
      }
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
    };
  }, [stopIdleAnimation]);

  const controller: Live2DController = {
    playEmotion,
    playMotion,
    setExpression,
    setLipSync,
    startIdleAnimation,
    stopIdleAnimation,
  };

  return {
    initialize,
    isLoaded,
    loadError,
    controller,
    modelRef,
  };
}
