import { common } from './common';
import { nav } from './nav';
import { pickers } from './pickers';
import { language } from './language';
import { app } from './app';
import { auth } from './auth';
import { home } from './home';
import { history } from './history';
import { goals } from './goals';
import { report } from './report';
import { profile } from './profile';
import { alerts } from './alerts';
import { invest } from './invest';
import { files } from './files';
import { errors } from './errors';
import { setup } from './setup';
import { plan } from './plan';

import type { en } from '../en';

export const zh: typeof en = { common, nav, pickers, language, app, auth, home, history, goals, report, profile, alerts, invest, files, errors, plan, setup };
