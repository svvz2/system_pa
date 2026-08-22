import net from 'node:net';

const listenPort = Number(process.env.LAN_PROXY_PORT ?? 8083);
const targetPort = Number(process.env.SUPABASE_LOCAL_PORT ?? 55321);

const server = net.createServer((client) => {
  const upstream = net.createConnection({ host: '127.0.0.1', port: targetPort });
  client.setKeepAlive(true);
  upstream.setKeepAlive(true);
  client.pipe(upstream);
  upstream.pipe(client);

  const closeBoth = () => {
    client.destroy();
    upstream.destroy();
  };
  client.on('error', closeBoth);
  upstream.on('error', closeBoth);
});

server.on('error', (error) => {
  console.error(`LAN proxy failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(listenPort, '0.0.0.0', () => {
  console.log(`Supabase LAN proxy: 0.0.0.0:${listenPort} -> 127.0.0.1:${targetPort}`);
});

