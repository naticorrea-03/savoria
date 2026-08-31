import { createGameServer } from './app.js';

const port = Number(process.env.PORT || 2567);
const host = process.env.HOST || '0.0.0.0';
const gameServer = createGameServer({ gracefullyShutdown: true, greet: true });

await gameServer.listen(port, host);
