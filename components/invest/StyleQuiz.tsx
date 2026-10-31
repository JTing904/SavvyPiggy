import React, { useState } from 'react';
import type { InvestSettings, StyleMix } from '../../types';
import { QUESTION_POINTS, STYLES, adjustMix, mixFromAnswers, type Style, type StyleRecord } from '../../services/advisor/model';
import { useT } from '../../contexts/LanguageContext';
import { useBackHandler } from '../../hooks/useBackHandler';
import { STYLE_COLORS } from './monthlyPlan';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { PageBand } from '../ui/PageBand';

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
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-page font-figtree text-ink veil-in">
      {/* The shared slider style draws a green thumb; each style's slider takes its own colour. */}
      <style>
        {STYLES.map(
          // Android's WebView only restyles the thumb when the thumb itself drops
          // its native look; without that it stayed the system blue.
          (style) => `input[type="range"].style-range-${style}{-webkit-appearance:none;appearance:none}input[type="range"].style-range-${style}::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;border-radius:50%;margin-top:-10px;background:${STYLE_COLORS[style]};box-shadow:0 1px 4px rgba(0,0,0,.35)}`
        ).join('')}
      </style>

      <div className="mx-auto flex h-full max-w-md flex-col">
        <div className="shrink-0">
          <PageBand
            title={s.styleTitle}
            onBack={onMix ? () => setStep(QUESTIONS - 1) : undefined}
            trailing={
              required ? (
                <button type="button" onClick={onClose} className="-mr-2 min-h-11 shrink-0 px-2 text-[14px] font-bold active:opacity-70">
                  {s.notNow}
                </button>
              ) : (
                <button type="button" onClick={onClose} aria-label={t.common.close} className="-mr-2.5 grid size-11 shrink-0 place-items-center active:opacity-70">
                  <Icon name="close" size={22} strokeWidth={2.2} />
                </button>
              )
            }
          />
        </div>

        {question ? (
          <>
            <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-6 pt-3">
              {required && step === 0 && (
                <div className="mb-4 flex gap-2.5 rounded-3xl bg-sun px-4 py-3">
                  <Icon name="lock" size={18} className="mt-0.5" />
                  <p className="text-[13px] font-semibold leading-relaxed">{s.gate}</p>
                </div>
              )}

              <div className="flex gap-1.5 px-1" aria-hidden>
                {Array.from({ length: QUESTIONS }, (_, i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-c1' : 'bg-track'}`} />
                ))}
              </div>

              <p className="mt-5 px-1 text-[12.5px] font-bold text-mute">{s.questionOf(step + 1, QUESTIONS)}</p>
              <h3 className="mt-1 px-1 text-[20px] font-bold leading-snug">{question.text}</h3>

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
                      className={`flex min-h-14 w-full items-center gap-3 rounded-3xl bg-card p-3.5 text-left active:opacity-80 ${on ? 'outline outline-2 outline-cta' : ''}`}
                    >
                      <span className={`size-5 shrink-0 rounded-full ${on ? 'border-[6px] border-ink' : 'border-2 border-mute'}`} />
                      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 px-4 pb-6 pt-3">
              <Button variant="ghost" full={false} className="flex-1" disabled={step === 0} onClick={() => setStep(step - 1)}>
                {t.common.back}
              </Button>
              <Button full={false} className="flex-[2]" disabled={answers[step] === undefined} onClick={() => setStep(step + 1)}>
                {step === QUESTIONS - 1 ? s.seeMyStyle : t.common.next}
              </Button>
            </div>
            <div className="safe-pb" />
          </>
        ) : (
          <>
            <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-6 pt-3">
              <p className="px-1 text-[13.5px] font-semibold text-mute">{s.fromAnswers}</p>
              <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-track">
                {STYLES.map((style) => (
                  <span key={style} className="h-full transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${shownMix[style]}%`, background: STYLE_COLORS[style] }} />
                ))}
              </div>
              <p className="mt-2 px-1 text-[12.5px] font-medium leading-relaxed text-mute">{s.mixHint}</p>

              <div className="mt-3 space-y-2">
                {STYLES.map((style) => {
                  const color = STYLE_COLORS[style];
                  const value = shownMix[style];
                  const record = records ? records[style] : undefined;
                  // The same bar as the monthly buy page: a few points over chance is not skill.
                  const weak = record ? record.hitRate - record.randomRate < 0.05 : false;
                  return (
                    <div key={style} className="rounded-3xl bg-card p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                        <p className="min-w-0 flex-1 truncate text-[15.5px] font-bold">{s.styles[style].name}</p>
                        <span className="shrink-0 text-[15.5px] font-bold tabular-nums">{value}%</span>
                      </div>
                      <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-mute">{s.styles[style].blurb}</p>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={value}
                        aria-label={s.styles[style].name}
                        onChange={(e) => setMix(adjustMix(shownMix, style, Number(e.target.value)))}
                        className={`style-range-${style} mb-2 mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full`}
                        style={{ background: `linear-gradient(to right, ${color} ${value}%, rgb(var(--line) / 0.12) ${value}%)` }}
                      />
                      {records && (
                        <p className={`mt-2 text-[12px] font-semibold leading-relaxed ${weak ? 'text-warn' : 'text-mute'}`}>
                          {record ? s.record(percent(record.hitRate), percent(record.randomRate)) + (weak ? s.noBetter : '') : s.noRecord}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <button type="button" onClick={() => setStep(0)} className="mt-2 min-h-11 w-full text-[13.5px] font-bold text-tblue active:opacity-70">
                {s.redoQuestions}
              </button>
            </div>

            <div className="px-4 pb-6 pt-3">
              <Button disabled={!complete(answers)} onClick={finish}>
                {required ? s.continueToPick : t.common.save}
              </Button>
              <p className="mt-2 text-center text-[12.5px] font-medium leading-relaxed text-mute">{s.redoNote}</p>
            </div>
            <div className="safe-pb" />
          </>
        )}
      </div>
    </div>
  );
};

export default StyleQuiz;
