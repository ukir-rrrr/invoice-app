import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'lib/domain');
const forbidden = [/from ['"]react/, /from ['"]react-native/, /from ['"]expo/];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      walk(p);
    } else if (name.endsWith('.ts')) {
      const text = fs.readFileSync(p, 'utf8');
      for (const re of forbidden) {
        if (re.test(text)) {
          console.error(`Forbidden import in ${p}`);
          process.exit(1);
        }
      }
    }
  }
}

walk(root);
