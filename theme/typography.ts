import type { TextStyle } from 'react-native';

export const typography = {
  screen: { fontSize: 26, lineHeight: 32, fontWeight: '700' as TextStyle['fontWeight'] },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as TextStyle['fontWeight'] },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as TextStyle['fontWeight'] },
  bodyBold: { fontSize: 16, lineHeight: 22, fontWeight: '700' as TextStyle['fontWeight'] },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: '400' as TextStyle['fontWeight'] },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as TextStyle['fontWeight'] },
  tab: { fontSize: 12, lineHeight: 16, fontWeight: '400' as TextStyle['fontWeight'] },
};
