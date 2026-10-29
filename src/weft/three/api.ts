import type {
  PreparedSurfaceSource,
  SeedCursorFactory,
  SurfaceGlyphUnits,
  SurfacePaletteEntry,
} from '../core'
import {
  prepareSemanticSurfaceText,
  prepareSurfaceText,
} from '../core'
import {
  createSemanticStateSet,
  type SurfaceBehavior,
  type SurfacePreset,
} from '../runtime'
import { fieldLayout, skyLayout, wallLayout } from './helpers/layouts'
import { threeInstancedMeshRenderer } from './helpers/instancing'
import { createSurfaceRuntime, type SurfaceEffectRuntime, type SurfaceRuntimeOptions } from './surfaceRuntime'

type SurfaceSourceOptions<TokenId extends string = string, Meta = unknown> =
  | {
      cacheKey: string
      units: SurfaceGlyphUnits
      repeat: number
      font?: string
    }
  | {
      cacheKey: string
      palette: readonly SurfacePaletteEntry<TokenId, Meta>[]
      repeat: number
      font?: string
      semantic?: true
    }

export function createSurfaceSource(
  options: {
    cacheKey: string
    units: SurfaceGlyphUnits
    repeat: number
    font?: string
  },
): PreparedSurfaceSource<string, Record<string, never>>
export function createSurfaceSource<TokenId extends string, Meta>(
  options: {
    cacheKey: string
    palette: readonly SurfacePaletteEntry<TokenId, Meta>[]
    repeat: number
    font?: string
    semantic?: true
  },
): PreparedSurfaceSource<TokenId, Meta>
export function createSurfaceSource<TokenId extends string, Meta>(
  options: SurfaceSourceOptions<TokenId, Meta>,
): PreparedSurfaceSource<string, Record<string, never>> | PreparedSurfaceSource<TokenId, Meta> {
  if ('units' in options) {
    return prepareSurfaceText(options.cacheKey, options.units, options.repeat, options.font)
  }

  return options.semantic
    ? prepareSemanticSurfaceText(options.cacheKey, options.palette, options.repeat, options.font)
    : prepareSurfaceText(options.cacheKey, options.palette, options.repeat, options.font)
}

export type RecoverableDamageConfig = {
  recoveryRate: number
  radius: number
  strength?: number
}

export function recoverableDamage(
  config: RecoverableDamageConfig,
): SurfaceBehavior<RecoverableDamageConfig> {
  return {
    kind: 'recoverable-damage',
    config,
  }
}

export function semanticStates<const TState extends string>(states: readonly TState[]) {
  return createSemanticStateSet(states)
}

export type SurfaceEffectConfig = {
  id: string
  source: PreparedSurfaceSource<any, any>
  layout: ReturnType<typeof fieldLayout> | ReturnType<typeof wallLayout> | ReturnType<typeof skyLayout>
  renderer?: ReturnType<typeof threeInstancedMeshRenderer>
  behaviors?: readonly SurfaceBehavior[]
  preset?: SurfacePreset
  seedCursor?: SeedCursorFactory
}

type SourceToken<T> = T extends PreparedSurfaceSource<infer TokenId, any> ? TokenId : string
type SourceMeta<T> = T extends PreparedSurfaceSource<any, infer Meta> ? Meta : unknown
export type SurfaceEffectDefinition<TConfig extends SurfaceEffectConfig> = TConfig & {
  createRuntime(options: SurfaceRuntimeOptions<SourceToken<TConfig['source']>, SourceMeta<TConfig['source']>>):
    SurfaceEffectRuntime<SourceToken<TConfig['source']>, SourceMeta<TConfig['source']>>
}

export function createSurfaceEffect<TConfig extends SurfaceEffectConfig>(config: TConfig): SurfaceEffectDefinition<TConfig> {
  // Existing factories continue reading config.source/layout. Runtime resources are allocated only on demand.
  const definition = { ...config, createRuntime: (options: SurfaceRuntimeOptions<any, any>) => createSurfaceRuntime(definition, options) }
  return definition as SurfaceEffectDefinition<TConfig>
}

export {
  fieldLayout,
  skyLayout,
  threeInstancedMeshRenderer,
  wallLayout,
}
