import React, { useState } from 'react';
import type { InvestSettings, StyleMix } from '../../types';
import { QUESTION_POINTS, STYLES, adjustMix, mixFromAnswers, type Style, type StyleRecord } from '../../services/advisor/model';
import { useT } from '../../contexts/LanguageContext';
import { useBackHandler } from '../../hooks/useBackHandler';

interface StyleQuizProps {
  /** Existing answers to start from, or null for a first run. */
  initial: InvestSettings['style'];
  /** Past record per style for the person's list, when known (from useAdvisor). */
  records?: Record<Style, StyleRecord | null> | null;
  /** True when this blocks a first Buy: the close button reads as "Not now" and cancels the buy. */
  required?: boolean;
  /** Start on the mix screen (editing) instead of question 1. */
  startOnMix?: boolean;
  onDone: (style: { answers: number[]; mix: StyleMix; at: number }) => void;
  onClose: () => void;
}

/** One colour per style, the same wherever a style is drawn. */
export const STYLE_COLORS: Record<Style, string> = {
  income: '#2DD4BF',
  cash: '#FBBF24',
  price: '#A78BFA',
};

const QUESTIONS = QUESTION_POINTS.length;

/** Answers are only usable when every question has one that the model knows. */
const complete = (answers: (number | undefined)[]): answers is number[] =>
  answers.length === QUESTIONS && QUESTION_POINTS.every((options, q) => {
    const a = answers[q];
    return a !== undefined && a >= 0 && a < options.length;
  });

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

/**
 * What someone wants from shares, asked one question at a time, and the mix of
 * the three styles it comes to. The mix can be dragged by hand afterwards;
 * under each style sits how that style's model has actually done on their own
 * list, so a heavy share-price weighting is chosen knowing it is close to a
 * coin toss.
 */
const StyleQuiz: React.FC<StyleQuizProps> = ({ initial, records, required, startOnMix, onDone, onClose }) => {
  const t = useT();
  const s = t.setup;
  useBackHandler(true, onClose);

  const [answers, setAnswers] = useState<(number | undefined)[]>(() => initial?.answers.slice(0, QUESTIONS) ?? []);
  // A hand-adjusted mix is kept until an answer changes; then the answers speak again.
  const [mix, setMix] = useState<StyleMix | null>(initial?.mix ?? null);
  // Step QUESTIONS is the mix screen. It cannot be opened without a full set of answers to stand on.
  const [step, setStep] = useState(() => (startOnMix && initial && complete(initial.answers) ? QUESTIONS : 0));

  const onMix = step === QUESTIONS;
  const shownMix: StyleMix = mix ?? (complete(answers) ? mixFromAnswers(answers) : { income: 34, cash: 33, price: 33 });

  const answer = (option: number) => {
    if (answers[step] === option) return;
    const next = [...answers];
    next[step] = option;
    setAnswers(next);
    setMix(null);
  };

  const finish = () => {
    if (!complete(answers)) return;
    onDone({ answers: [...answers], mix: { ...shownMix }, at: Date.now() });
  };

  const question = onMix ? null : s.questions[step];

  return (
    <div className="fixed inset-0 z-50 bg-bg-dark veil-in">
      {/* The shared slider style draws a green thumb; each style's slider takes its own colour. */}
      <style>
        {STYLES.map(
          (style) => `input[type="range"].style-range-${style}::-webkit-slider-thumb{background:${STYLE_COLORS[style]};box-shadow:0 0 12px ${STYLE_COLORS[style]}80}`
        ).join('')}
      </style>

      <div className="h-full max-w-md mx-auto flex flex-col safe-pt">
        <div className="flex items-center px-6 py-4 gap-3">
          {onMix && (
            <button
              onClick={() => setStep(QUESTIONS - 1)}
              aria-label={t.common.back}
              className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
            >
              <span className="material-symbols-rounded text-xl">arrow_back_ios_new</span>
            </button>
          )}
          <h2 className="flex-1 min-w-0 text-white text-2xl font-black tracking-tight truncate">{s.styleTitle}</h2>
          {required ? (
            <button
              onClick={onClose}
              className="h-10 shrink-0 px-4 rounded-full glass text-slate-300 text-sm font-black active:scale-95 transition-transform"
            >
              {s.notNow}
            </button>
          ) : (
            <button
              onClick={onClose}
              aria-label={t.common.close}
              className="size-10 shrink-0 rounded-full glass flex items-center justify-center text-slate-300 active:scale-90 transition-transform"
            >
              <span className="material-symbols-rounded text-xl">close</span>
            </button>
          )}
        </div>

        {question ? (
          <>
            <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-6">
              {required && step === 0 && (
                <div className="flex gap-2.5 rounded-2xl bg-accent/10 px-4 py-3 mb-4">
                  <span className="material-symbols-rounded text-accent text-lg shrink-0">lock</span>
                  <p className="text-slate-300 text-xs font-bold leading-relaxed">{s.gate}</p>
                </div>
              )}

              <div className="flex gap-1" aria-hidden>
                {Array.from({ length: QUESTIONS }, (_, i) => (
                  <span key={i} className={`flex-1 h-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-white/10'}`} />
                ))}
              </div>

              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-5">
                {s.questionOf(step + 1, QUESTIONS)}
              </p>
              <h3 className="text-white text-xl font-black leading-snug mt-2">{question.text}</h3>

              <div className="mt-4 space-y-2" role="radiogroup" aria-label={question.text}>
                {question.options.map((label, option) => {
                  const on = answers[step] === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => answer(option)}
                      className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left active:scale-[0.98] transition-all ${
                        on ? 'bg-accent/10 border-accent/50' : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <span
                        className={`size-4 shrink-0 rounded-full transition-all ${
                          on ? 'border-[5px] border-accent' : 'border-2 border-slate-600'
                        }`}
                      />
                      <span className="flex-1 min-w-0 text-white text-sm font-bold leading-snug">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 px-6 pt-3 pb-6">
              <button
                onClick={() => setStep(step - 1)}
                disabled={step === 0}
                className="flex-1 h-14 rounded-full glass text-white font-black disabled:opacity-30 active:scale-95 transition-all"
              >
                {t.common.back}
              </button>
              <button
                onClick={() => setStep(step + 1)}
                disabled={answers[step] === undefined}
                className="flex-[2] h-14 rounded-full bg-accent text-black font-black disabled:opacity-30 active:scale-95 transition-all"
              >
                {step === QUESTIONS - 1 ? s.seeMyStyle : t.common.next}
              </button>
            </div>
            <div className="safe-pb" />
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-6">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{s.fromAnswers}</p>
              <div className="flex h-3.5 rounded-full overflow-hidden mt-3 bg-white/5">
                {STYLES.map((style) => (
                  <span
                    key={style}
                    className="h-full transition-[width] duration-200"
                    style={{ width: `${shownMix[style]}%`, background: STYLE_COLORS[style] }}
                  />
                ))}
              </div>
              <p className="text-slate-500 text-[11px] font-bold mt-2 leading-relaxed">{s.mixHint}</p>

              <div className="mt-5 space-y-3">
                {STYLES.map((style) => {
                  const color = STYLE_COLORS[style];
                  const value = shownMix[style];
                  const record = records ? records[style] : undefined;
                  const weak = record ? record.hitRate < record.randomRate : false;
                  return (
                    <div key={style} className="rounded-2xl glass p-4">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                        <p className="flex-1 min-w-0 text-white text-base font-black truncate">{s.styles[style].name}</p>
                        <span className="shrink-0 text-base font-black tabular-nums" style={{ color }}>
                          {value}%
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs font-bold mt-1 leading-relaxed">{s.styles[style].blurb}</p>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={value}
                        aria-label={s.styles[style].name}
                        onChange={(e) => setMix(adjustMix(shownMix, style, Number(e.target.value)))}
                        className={`style-range-${style} w-full h-1.5 mt-4 mb-2 rounded-full appearance-none cursor-pointer`}
                        style={{
                          background: `linear-gradient(to right, ${color} ${value}%, rgba(255,255,255,0.1) ${value}%)`,
                        }}
                      />
                      {records && (
                        <p
                          className={`text-[11px] font-bold mt-2 leading-relaxed ${
                            weak ? 'text-amber-400' : 'text-slate-500'
                          }`}
                        >
                          {record
                            ? s.record(percent(record.hitRate), percent(record.randomRate)) + (weak ? s.noBetter : '')
                            : s.noRecord}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setStep(0)}
                className="w-full mt-4 py-2 text-slate-400 text-xs font-black active:scale-95 transition-transform"
              >
                {s.redoQuestions}
              </button>
            </div>

            <div className="px-6 pt-3 pb-6">
              <button
                onClick={finish}
                disabled={!complete(answers)}
                className="w-full h-14 rounded-full bg-primary text-black font-black disabled:opacity-30 active:scale-95 transition-all"
              >
                {required ? s.continueToBuy : t.common.save}
              </button>
              <p className="text-slate-500 text-[11px] font-bold mt-3 text-center leading-relaxed">{s.redoNote}</p>
            </div>
            <div className="safe-pb" />
          </>
        )}
      </div>
    </div>
  );
};

export default StyleQuiz;
