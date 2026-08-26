import { compileLevel } from './compiler.js';
import { THEMES } from './themes.js';
import { assertValidReleasedLevels } from './validate.js';
import { WORLD_ONE, WORLD_ONE_LEVELS } from './world-one.js';

export const RELEASED_WORLDS = [WORLD_ONE];
export const RELEASED_LEVELS = WORLD_ONE_LEVELS;

assertValidReleasedLevels(RELEASED_LEVELS);

export function buildReleasedLevel(definition) {
  const theme = THEMES[definition.theme];
  const compiled = compileLevel(definition, theme);
  return {
    ...compiled,
    name: compiled.displayName,
    themeDecos: theme.deco,
  };
}
