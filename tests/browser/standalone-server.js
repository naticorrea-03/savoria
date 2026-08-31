import { createGameServer } from '../../server/app.js';

const gameServer = createGameServer({ gracefullyShutdown: false, greet: false });
await gameServer.listen(0, '127.0.0.1');
const address = gameServer.transport.server.address();

if (!address || typeof address === 'string') throw new Error('Standalone test server has no TCP port');
process.stdout.write(`SAVORIA_TEST_ORIGIN=http://127.0.0.1:${address.port}\n`);
