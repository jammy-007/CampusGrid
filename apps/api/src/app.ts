import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './lib/env';
import { errorHandler, notFoundHandler } from './middleware/error';

// Agent 1
import { router as authRouter } from './modules/auth';
import { router as usersRouter } from './modules/users';
import { router as eventsRouter } from './modules/events';
import { router as registrationsRouter } from './modules/registrations';
import { router as teamsRouter } from './modules/teams';
// Agent 2
import { router as passesRouter } from './modules/passes';
import { router as checkinRouter } from './modules/checkin';
import { router as certificatesRouter } from './modules/certificates';
// Agent 3
import { router as chatRouter } from './modules/chat';
// Agent 4
import { router as submissionsRouter } from './modules/submissions';
import { router as judgingRouter } from './modules/judging';
import { router as leaderboardRouter } from './modules/leaderboard';

/**
 * Every module router is mounted at /api and declares its full paths from there,
 * so owners never need to edit this file.
 */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.appUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use(
    '/api',
    authRouter,
    usersRouter,
    eventsRouter,
    registrationsRouter,
    teamsRouter,
    passesRouter,
    checkinRouter,
    certificatesRouter,
    chatRouter,
    submissionsRouter,
    judgingRouter,
    leaderboardRouter,
  );

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
