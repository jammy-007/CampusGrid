import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './lib/env';
import { initIO } from './realtime/io';

const app = createApp();
const server = createServer(app);
initIO(server);

server.listen(env.port, () => {
  console.log(`CampusGrid API listening on http://localhost:${env.port}`);
});
