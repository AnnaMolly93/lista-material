import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { migrateDatabase } from './migrations.ts';
import { registerApiRoutes } from './routes.ts';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));

await migrateDatabase();
registerApiRoutes(app);

if (isProduction) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));

  app.use(express.static(currentDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(currentDir, 'index.html'));
  });
} else {
  const vite = await createViteServer({
    appType: 'spa',
    server: {
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {}
    }
  });

  app.use(vite.middlewares);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
