import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type ThemeColors } from './colors';

export function useTheme(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkColors : lightColors;
}
