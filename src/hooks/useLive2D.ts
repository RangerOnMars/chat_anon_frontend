import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import * as PIXI from 'pixi.js-legacy';
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

// Emotion to motion mapping for live2d model.json (motion groups by name; index 0 per group)
const emotionMotionMap: Record<string, { groups: string[] }> = {
  happy: { groups: ['smile01', 'smile02', 'smile03', 'smile04'] },
  sad: { groups: ['sad01', 'sad02'] },
  angry: { groups: ['angry01', 'angry02', 'angry03', 'angry04'] },
  surprised: { groups: ['surprised01'] },
  thinking: { groups: ['thinking01', 'thinking02', 'thinking03'] },
  idle: { groups: ['idle01'] },
  shame: { groups: ['shame01', 'shame02'] },
  cry: { groups: ['cry01', 'cry02'] },
};

// Expression mapping (live2d uses same names; neutral/default for lip-sync test)
const emotionExpressionMap: Record<string, string> = {
  happy: 'smile01',
  sad: 'sad01',
  angry: 'angry01',
  surprised: 'surprised01',
  thinking: 'thinking01',
  idle: 'idle01',
  shame: 'shame01',
  cry: 'cry01',
  neutral: 'default', // 中立表情，用于唇形测试（新模型无 normal，用 default）
};

/** Motion groups for canvas click: pick one at random. */
const CLICK_RANDOM_MOTIONS = [
  'smile01', 'smile02', 'smile03', 'smile04',
  'thinking01', 'thinking02', 'wink01', 'bye01',
];

/** 测试时强制使用中立表情，便于观察嘴部开合；设为 false 可恢复按情绪切换表情 */
const USE_NEUTRAL_EXPRESSION_FOR_TEST = true;

export interface Live2DController {
  playEmotion: (emotion: string) => void;
  playMotion: (group: string, index: number) => void;
  setExpression: (expression: string) => void;
  setLipSync: (value: number) => void;
  startIdleAnimation: () => void;
  stopIdleAnimation: () => void;
}

export function useLive2D(primaryPath: string, fallbackPath?: string | null) {
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<Live2DModel | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const idleIntervalRef = useRef<number | null>(null);
  const lipSyncPrevRef = useRef<number>(0);
  /** Desired mouth value (0–1), applied in ticker after model update so motion doesn't overwrite. */
  const lipSyncValueRef = useRef<number>(0);
  /** Cached mouth param index and API so we apply in ticker without re-resolving. */
  const mouthParamIndexRef = useRef<number>(-1);
  const mouthUseCub2Ref = useRef<boolean>(false);
  const lipSyncParamNotFoundLogRef = useRef<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const primaryPathRef = useRef<string>(primaryPath);
  /** Base path of the currently loaded model (e.g. /live2d/anon/casual-2023); used in teardown to clear PIXI texture cache. */
  const modelBasePathRef = useRef<string>('');

  // Teardown: destroy model and app, remove canvas from container, clear refs and loading state (force full PIXI reload on model switch)
  const teardown = useCallback(() => {
    const modelBasePath = modelBasePathRef.current;
    console.log('[Live2D] teardown start, modelBasePath=', modelBasePath);
    if (idleIntervalRef.current) {
      clearInterval(idleIntervalRef.current);
      idleIntervalRef.current = null;
    }
    // Clear container so next init gets empty DOM (avoids stale canvas when key remounts)
    const container = containerRef.current;
    if (container) {
      container.innerHTML = '';
      containerRef.current = null;
    }
    // Clear PIXI global texture cache for this model so next load does not hit "already had an entry" and displays the new model
    const cache = (PIXI as unknown as { BaseTextureCache?: Record<string, { destroy?: () => void }> }).BaseTextureCache;
    if (cache && modelBasePath) {
      const ids = Object.keys(cache).filter((id) => id.startsWith(modelBasePath));
      for (const id of ids) {
        const bt = cache[id];
        if (bt && typeof bt.destroy === 'function') bt.destroy();
      }
      if (ids.length) console.log('[Live2D] cleared BaseTextureCache entries:', ids.length);
    }
    const textureCache = (PIXI as unknown as { TextureCache?: Record<string, { destroy?: () => void }> }).TextureCache;
    if (textureCache && modelBasePath) {
      const texIds = Object.keys(textureCache).filter((id) => id.startsWith(modelBasePath));
      for (const id of texIds) {
        const t = textureCache[id];
        if (t && typeof t.destroy === 'function') t.destroy();
      }
      if (texIds.length) console.log('[Live2D] cleared TextureCache entries:', texIds.length);
    }
    const model = modelRef.current;
    if (model) {
      const ext = model as unknown as Record<string, unknown>;
      const origUpdate = ext._lipSyncOrigUpdate as ((dt: number, now: number) => void) | undefined;
      const internalModel = ext._lipSyncInternalModel as { update?: (dt: number, now: number) => void; off?: (event: string, fn: () => void) => void } | undefined;
      const applyMouth = ext._lipSyncApplyMouth as (() => void) | undefined;
      if (internalModel && applyMouth && typeof internalModel.off === 'function') internalModel.off('beforeModelUpdate', applyMouth);
      if (internalModel && origUpdate) internalModel.update = origUpdate;
    }
    if (model) {
      const ext2 = model as unknown as Record<string, unknown>;
      const canvas = ext2._canvasEl as HTMLCanvasElement | undefined;
      const onMove = ext2._canvasPointerMove as ((e: MouseEvent) => void) | undefined;
      const onClick = ext2._canvasClick as (() => void) | undefined;
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
    const app = appRef.current;
    if (app) {
      const view = app.view as HTMLCanvasElement;
      if (view?.parentNode) view.parentNode.removeChild(view);
      app.destroy(true, { children: true, texture: true });
      appRef.current = null;
    }
    mouthParamIndexRef.current = -1;
    modelBasePathRef.current = '';
    setIsLoaded(false);
    setLoadError(null);
    console.log('[Live2D] teardown done');
  }, []);

  // Initialize PIXI app and load model
  const initialize = useCallback(async (container: HTMLDivElement) => {
    if (appRef.current) {
      console.log('[Live2D] initialize skipped (app already exists), primaryPath=', primaryPath);
      return;
    }
    console.log('[Live2D] initialize start, primaryPath=', primaryPath, 'fallbackPath=', fallbackPath ?? null);
    containerRef.current = container;

    try {
      // Yield to browser to allow loading animation to render
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Create PIXI application (PIXI v7 API - options in constructor)
      // When WebGL is unavailable (e.g. context limit, no stencil), force Canvas renderer (pixi.js-legacy fallback).
      const useCanvasFallback = typeof PIXI?.utils?.isWebGLSupported === 'function' && !PIXI.utils.isWebGLSupported();
      const resolution = Math.min(window.devicePixelRatio || 1, 2);
      const appOptions = {
        view: document.createElement('canvas'),
        resizeTo: container,
        backgroundAlpha: 0,
        antialias: false, // Disable to reduce GPU memory
        resolution,
        autoDensity: true,
        ...(useCanvasFallback && { forceCanvas: true as const }),
      };

      const app = new PIXI.Application(appOptions);

      container.appendChild(app.view as HTMLCanvasElement);
      appRef.current = app;

      // Yield again before loading the model
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Load Live2D model: try primary path, then fallback if provided and different
      let model: Live2DModel;
      try {
        model = await Live2DModel.from(primaryPath, {
          autoInteract: false,
          autoUpdate: true,
        });
      } catch (primaryError) {
        if (fallbackPath && primaryPath !== fallbackPath) {
          try {
            model = await Live2DModel.from(fallbackPath, {
              autoInteract: false,
              autoUpdate: true,
            });
          } catch (fallbackError) {
            throw primaryError;
          }
        } else {
          throw primaryError;
        }
      }

      modelRef.current = model;
      modelBasePathRef.current = primaryPath.replace(/\/model\.json$/i, '');
      console.log('[Live2D] model loaded, primaryPath=', primaryPath);

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
        const group = CLICK_RANDOM_MOTIONS[Math.floor(Math.random() * CLICK_RANDOM_MOTIONS.length)];
        model.motion(group, 0);
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

      // 默认设为中立表情（便于唇形测试）
      const defaultExpression = USE_NEUTRAL_EXPRESSION_FOR_TEST ? (emotionExpressionMap.neutral ?? 'default') : emotionExpressionMap.idle;
      try {
        model.expression(defaultExpression);
      } catch (_) {
        // 模型可能没有 normal，忽略
      }

      // Resolve mouth param index (Cubism 4 or 2). Call when index is -1 so we retry until model is ready.
      const tryResolveMouthParam = () => {
        const coreModel = model.internalModel?.coreModel as {
          getParameterIndex?: (name: string) => number;
          getParamIndex?: (name: string) => number;
        } | undefined;
        if (!coreModel) return;
        const paramNames = ['PARAM_MOUTH_OPEN_Y', 'ParamMouthOpenY', 'Mouth_Open'];
        for (const paramName of paramNames) {
          try {
            const idx4 = coreModel.getParameterIndex?.(paramName) ?? -1;
            if (idx4 >= 0) {
              mouthParamIndexRef.current = idx4;
              mouthUseCub2Ref.current = false;
              console.debug('[Live2D] Lip sync param resolved (Cubism 4):', paramName);
              return;
            }
          } catch {
            //
          }
        }
        for (const paramName of paramNames) {
          try {
            const idx2 = coreModel.getParamIndex?.(paramName) ?? -1;
            if (idx2 >= 0) {
              mouthParamIndexRef.current = idx2;
              mouthUseCub2Ref.current = true;
              console.debug('[Live2D] Lip sync param resolved (Cubism 2):', paramName);
              return;
            }
          } catch {
            //
          }
        }
      };

      // Apply lip sync: write mouth param. Used in beforeModelUpdate (after physics/pose, before model.update/loadParam) and after origUpdate (after loadParam) so we win over physics/breath.
      const applyMouthFromRef = () => {
        const val = lipSyncValueRef.current;
        if (mouthParamIndexRef.current < 0) {
          if (val > 0) tryResolveMouthParam();
          return;
        }
        const core = model.internalModel.coreModel as {
          setParameterValueByIndex?: (i: number, v: number, w?: number) => void;
          setParamFloat?: (id: string | number, v: number, w?: number) => void;
        };
        if (mouthUseCub2Ref.current) {
          core.setParamFloat?.(mouthParamIndexRef.current, val);
        } else {
          core.setParameterValueByIndex?.(mouthParamIndexRef.current, val, 1);
        }
      };
      const internalModel = model.internalModel as {
        update: (dt: number, now: number) => void;
        on?: (event: string, fn: () => void) => void;
        off?: (event: string, fn: () => void) => void;
      };
      const origUpdate = internalModel.update.bind(internalModel);
      // Scheme A: apply mouth in beforeModelUpdate (after physics/pose, before model.update/loadParam) so physics/breath don't overwrite for this frame
      if (typeof internalModel.on === 'function') {
        internalModel.on('beforeModelUpdate', applyMouthFromRef);
        modelExt._lipSyncApplyMouth = applyMouthFromRef;
      }
      internalModel.update = (dt: number, now: number) => {
        origUpdate(dt, now);
        applyMouthFromRef();
      };
      modelExt._lipSyncOrigUpdate = origUpdate;
      modelExt._lipSyncInternalModel = internalModel;

      // Optional runtime logging: physics outputs and breathParamIndex (to confirm if mouth is driven by physics/breath)
      const im = internalModel as Record<string, unknown>;
      console.debug('[Live2D] lip sync debug', {
        breathParamIndex: im.breathParamIndex,
        hasPhysics: !!im.physics,
        mouthParamIndex: mouthParamIndexRef.current,
      });
      const modelWithOn = model as unknown as { on?: (event: string, fn: (p: unknown) => void) => void };
      if (typeof modelWithOn.on === 'function') {
        modelWithOn.on('physicsLoaded', (physics: unknown) => {
          console.debug('[Live2D] physicsLoaded', physics);
          try {
            const rig = (physics as Record<string, unknown>)?._physicsRig as { outputs?: unknown[] } | undefined;
            if (rig?.outputs?.length) console.debug('[Live2D] physics outputs count', rig.outputs.length, '(sample)', rig.outputs[0]);
          } catch {
            // ignore
          }
        });
      }

      // Start idle animation after delay to ensure model is ready
      setTimeout(() => {
        startIdleAnimation();
      }, 1000);

    } catch (error) {
      console.error('Failed to load Live2D model:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load model');
      setIsLoaded(false);
    }
  }, [primaryPath, fallbackPath]);

  // Play emotion animation (live2d: one motion per group name, index 0)
  const playEmotion = useCallback((emotion: string) => {
    const model = modelRef.current;
    if (!model) return;

    const mapping = emotionMotionMap[emotion] || emotionMotionMap.idle;
    const group = mapping.groups[Math.floor(Math.random() * mapping.groups.length)];

    model.motion(group, 0);

    const expression = USE_NEUTRAL_EXPRESSION_FOR_TEST
      ? (emotionExpressionMap.neutral ?? 'default')
      : emotionExpressionMap[emotion];
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

  // Set lip sync value (0-1); stores in ref and caches param index. Apply immediately when index known so rAF vs PIXI ticker order doesn't drop frames.
  const setLipSync = useCallback((value: number) => {
    const model = modelRef.current;
    if (!model?.internalModel?.coreModel) return;

    const prev = lipSyncPrevRef.current;
    const smoothed = value === 0 ? 0 : prev * 0.25 + value * 0.75;
    lipSyncPrevRef.current = smoothed;
    lipSyncValueRef.current = smoothed;

    const core = model.internalModel.coreModel as {
      getParameterIndex?: (name: string) => number;
      getParamIndex?: (name: string) => number;
      setParameterValueByIndex?: (i: number, v: number, w?: number) => void;
      setParamFloat?: (id: string | number, v: number, w?: number) => void;
    };
    const paramNames = ['PARAM_MOUTH_OPEN_Y', 'ParamMouthOpenY', 'Mouth_Open'];

    if (mouthParamIndexRef.current < 0) {
      for (const paramName of paramNames) {
        try {
          const idx4 = core.getParameterIndex?.(paramName) ?? -1;
          if (idx4 >= 0) {
            mouthParamIndexRef.current = idx4;
            mouthUseCub2Ref.current = false;
            break;
          }
        } catch {
          //
        }
      }
      if (mouthParamIndexRef.current < 0) {
        for (const paramName of paramNames) {
          try {
            const idx2 = core.getParamIndex?.(paramName) ?? -1;
            if (idx2 >= 0) {
              mouthParamIndexRef.current = idx2;
              mouthUseCub2Ref.current = true;
              break;
            }
          } catch {
            //
          }
        }
      }
    }

    // Apply immediately so mouth updates even if PIXI ticker runs before our rAF next frame
    if (mouthParamIndexRef.current >= 0) {
      if (mouthUseCub2Ref.current) {
        core.setParamFloat?.(mouthParamIndexRef.current, smoothed);
      } else {
        core.setParameterValueByIndex?.(mouthParamIndexRef.current, smoothed, 1);
      }
    } else if (smoothed > 0.01) {
      const now = Date.now();
      if (now - lipSyncParamNotFoundLogRef.current > 1000) {
        lipSyncParamNotFoundLogRef.current = now;
        console.warn('[LipSync] mouth param not found (index -1), value=', smoothed);
      }
    }
  }, []);

  // Start idle animation loop (live2d: idle01 group, index 0)
  const startIdleAnimation = useCallback(() => {
    if (idleIntervalRef.current) return;

    idleIntervalRef.current = window.setInterval(() => {
      const model = modelRef.current;
      if (model?.internalModel?.motionManager) {
        try {
          model.motion('idle01', 0);
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

  // When primaryPath changes, teardown so next initialize() loads the new path (force PIXI reload)
  useEffect(() => {
    if (primaryPathRef.current !== primaryPath) {
      if (appRef.current) {
        console.log('[Live2D] primaryPath changed, tearing down. old=', primaryPathRef.current, 'new=', primaryPath);
        teardown();
      }
      primaryPathRef.current = primaryPath;
    }
  }, [primaryPath, teardown]);

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

  // When primary path changes (e.g. character switch), teardown first so the next initialize() can load the new model (otherwise initialize returns early when appRef.current exists).
  useEffect(() => {
    return () => teardown();
  }, [primaryPath, teardown]);

  // Cleanup on unmount: use same teardown (also removes canvas from container)
  useEffect(() => {
    return () => teardown();
  }, [teardown]);

  // Stable ref so Live2DCanvas lip-sync effect doesn't re-run on every parent re-render (avoids canceling rAF loop between sentences)
  const controller = useMemo<Live2DController>(
    () => ({
      playEmotion,
      playMotion,
      setExpression,
      setLipSync,
      startIdleAnimation,
      stopIdleAnimation,
    }),
    [playEmotion, playMotion, setExpression, setLipSync, startIdleAnimation, stopIdleAnimation]
  );

  return {
    initialize,
    isLoaded,
    loadError,
    controller,
    modelRef,
  };
}
