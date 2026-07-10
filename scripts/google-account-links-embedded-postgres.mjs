import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';

const HOST = '127.0.0.1';
const USER = 'postgres';
const PASSWORD = 'postgres';

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!port) {
          reject(new Error('Could not reserve a local Postgres port.'));
          return;
        }
        resolve(port);
      });
    });
  });
}

export async function createGoogleAccountLinksPostgresHarness(label) {
  const tempRoot = mkdtempSync(join(tmpdir(), `o2i-${label}-`));
  const databaseDir = join(tempRoot, 'pg-data');
  const port = await getAvailablePort();

  const instance = new EmbeddedPostgres({
    databaseDir,
    user: USER,
    password: PASSWORD,
    port,
    persistent: false,
    onLog: process.env.GOOGLE_ACCOUNT_LINKS_PG_DEBUG === '1' ? console.log : () => {},
    onError: process.env.GOOGLE_ACCOUNT_LINKS_PG_DEBUG === '1' ? console.error : () => {},
  });

  let stopped = false;

  return {
    instance,
    connection: {
      host: HOST,
      port,
      user: USER,
      password: PASSWORD,
    },
    async cleanup() {
      if (!stopped) {
        stopped = true;
        try {
          await instance.stop();
        } catch {
          // Cleanup is best effort; the smoke should report the original failure.
        }
      }
      rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}
