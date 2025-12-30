import { envConfigs } from '@/config';
import { defaultTheme } from '@/config/theme';

/**
 * get active theme
 */
export function getActiveTheme(): string {
  const theme = envConfigs.theme as string;

  if (theme) {
    return theme;
  }

  return defaultTheme;
}

/**
 * load theme page
 */
export async function getThemePage(pageName: string, theme?: string) {
  const loadTheme = theme || getActiveTheme();

  try {
    // load theme page
    const pageModule = await import(`@/themes/${loadTheme}/pages/${pageName}`);
    return pageModule.default;
  } catch (error) {
    console.log(
      `Failed to load page "${pageName}" from theme "${theme}":`,
      error
    );

    // fallback to default theme
    if (loadTheme !== defaultTheme) {
      try {
        const fallbackModule = await import(
          `@/themes/${defaultTheme}/pages/${pageName}`
        );
        return fallbackModule.default;
      } catch (fallbackError) {
        console.error(`Failed to load fallback page:`, fallbackError);
        throw fallbackError;
      }
    }

    throw error;
  }
}

/**
 * load theme layout
 */
export async function getThemeLayout(layoutName: string, theme?: string) {
  const loadTheme = theme || getActiveTheme();

  try {
    // load theme layout
    const layoutModule = await import(
      `@/themes/${loadTheme}/layouts/${layoutName}`
    );
    return layoutModule.default;
  } catch (error) {
    console.log(
      `Failed to load layout "${layoutName}" from theme "${theme}":`,
      error
    );

    // fallback to default theme
    if (loadTheme !== defaultTheme) {
      try {
        const fallbackModule = await import(
          `@/themes/${defaultTheme}/layouts/${layoutName}`
        );
        return fallbackModule.default;
      } catch (fallbackError) {
        console.error(`Failed to load fallback layout:`, fallbackError);
        throw fallbackError;
      }
    }

    throw error;
  }
}

/**
 * load theme block
 */
export async function getThemeBlock(blockName: string, theme?: string) {
  const loadTheme = theme || getActiveTheme();

  try {
    // load theme block
    const blockModule = await import(`@/themes/${loadTheme}/blocks/${blockName}`);
    return blockModule.default || blockModule[blockName] || blockModule;
  } catch (error) {
    console.error(
      `Failed to load block "${blockName}" from theme "${loadTheme}":`,
      error
    );

    // fallback to default theme
    if (loadTheme !== defaultTheme) {
      try {
        const fallbackModule = await import(
          `@/themes/${defaultTheme}/blocks/${blockName}`
        );
        return (
          fallbackModule.default || fallbackModule[blockName] || fallbackModule
        );
      } catch (fallbackError) {
        console.error(`Failed to load fallback block:`, fallbackError);
        throw fallbackError;
      }
    }

    throw error;
  }
}
