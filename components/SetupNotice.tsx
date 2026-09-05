import React from 'react';

const STEPS = [
  'Create a project at console.firebase.google.com',
  'Add a Web app and copy its firebaseConfig values',
  'Paste them into .env.local (see .env.local.example)',
  'Restart the dev server with npm run dev',
];

/** Shown when .env.local has no Firebase credentials yet. */
const SetupNotice: React.FC = () => (
  <div className="min-h-full flex flex-col justify-center px-6 py-12 safe-pt safe-pb">
    <div className="w-full max-w-md mx-auto">
      <div className="size-16 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-6">
        <span className="material-symbols-rounded text-3xl">construction</span>
      </div>
      <h1 className="text-white text-3xl font-black tracking-tight">Firebase not configured</h1>
      <p className="text-slate-500 font-medium mt-2">
        Follow <span className="text-primary font-bold">FIREBASE_SETUP.md</span> in the project root, or the
        short version below.
      </p>

      <ol className="mt-8 space-y-3">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-start gap-4 bg-surface border border-white/5 rounded-3xl p-5">
            <span className="size-7 shrink-0 rounded-full bg-primary/10 text-primary font-black text-xs flex items-center justify-center">
              {i + 1}
            </span>
            <p className="text-slate-300 text-sm font-medium leading-relaxed">{step}</p>
          </li>
        ))}
      </ol>
    </div>
  </div>
);

export default SetupNotice;
