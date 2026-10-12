import { spawn } from 'child_process';
import http from 'http';
import httpProxy from 'http-proxy';

const expoPort = Number(process.env.EXPO_INTERNAL_PORT ?? 8082);
const publicPort = Number(process.env.PORT ?? 8081);

const proxy = httpProxy.createProxyServer({
  target: `http://127.0.0.1:${expoPort}`,
  ws: true,
});

function withCoopCoep(res) {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
}

const server = http.createServer((req, res) => {
  withCoopCoep(res);
  proxy.web(req, res, (err) => {
    if (!res.headersSent) {
      res.writeHead(502);
    }
    res.end(err?.message ?? 'Bad gateway');
  });
});

server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head);
});

server.listen(publicPort, () => {
  console.log(`[web] http://localhost:${publicPort} (COOP/COEP) -> expo :${expoPort}`);
});

const expo = spawn('npx', ['expo', 'start', '--web', '--port', String(expoPort)], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { ...process.env, CI: process.env.CI ?? '1' },
});

function shutdown() {
  expo.kill('SIGTERM');
  server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

expo.on('exit', (code) => {
  server.close();
  process.exit(code ?? 0);
});
