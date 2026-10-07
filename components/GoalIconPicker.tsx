import React, { useMemo, useState } from 'react';
import { GOAL_ICON_GROUPS, iconGroupOf, searchGoalIcons } from '../services/goalIcons';
import { goalIconLabel, quickIconsFor } from '../services/goalEditForm';
import { useLanguage, useT } from '../contexts/LanguageContext';
import { Sheet } from './ui/Sheet';
import { Icon } from './ui/Icon';

/** One icon, as a 44dp+ cell. The chosen one has the ink outline and a check. */
const Cell: React.FC<{ name: string; selected: boolean; lang: 'en' | 'zh'; onPick: (name: string) => void }> = ({
  name,
  selected,
  lang,
  onPick,
}) => {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => onPick(name)}
      aria-pressed={selected}
      aria-label={goalIconLabel(name, lang)}
      className={`relative grid aspect-square min-h-11 w-full place-items-center rounded-2xl bg-card text-ink active:opacity-70 ${
        selected ? 'outline outline-2 outline-ink' : ''
      }`}
    >
      <span className="material-symbols-rounded" style={{ fontSize: 26 }} aria-hidden="true">
        {name}
      </span>
      {selected && (
        <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-cta text-cta-fg">
          <Icon name="check" size={10} strokeWidth={3} />
          <span className="sr-only">{t.ui.selected}</span>
        </span>
      )}
    </button>
  );
};

/**
 * Every icon a goal can wear, with a search that understands English, Chinese
 * and Malay words. With nothing typed the icons sit under their group's name;
 * typing turns it into one flat list of what matches.
 */
export const GoalIconPicker: React.FC<{
  value: string;
  onChange: (name: string) => void;
  lang: 'en' | 'zh';
}> = ({ value, onChange, lang }) => {
  const t = useT();
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const found = useMemo(() => (searching ? searchGoalIcons(query, lang) : []), [query, lang, searching]);

  return (
    <div>
      <label className="flex min-h-12 items-center gap-2 rounded-[18px] bg-field px-4 focus-within:outline focus-within:outline-2 focus-within:outline-ink">
        <Icon name="ser" size={18} className="text-mute" />
        <span className="sr-only">{t.goalEdit.searchIcons}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.goalEdit.searchPlaceholder}
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="search"
          className="min-h-6 w-full min-w-0 select-text border-0 bg-transparent p-0 font-figtree text-base font-semibold text-ink placeholder:text-mute focus:ring-0"
        />
      </label>

      {searching ? (
        found.length === 0 ? (
          <p className="px-1 py-8 text-center text-[13px] font-semibold text-mute">{t.goalEdit.noIconFound(query.trim())}</p>
        ) : (
          <div className="mt-4 grid grid-cols-5 gap-2">
            {found.map((i) => (
              <Cell key={i.name} name={i.name} selected={i.name === value} lang={lang} onPick={onChange} />
            ))}
          </div>
        )
      ) : (
        GOAL_ICON_GROUPS.map((g) => (
          <section key={g.key} className="mt-5" aria-label={lang === 'zh' ? g.zh : g.en}>
            <h3 className="mb-2 px-1 text-[12px] font-bold text-mute">{lang === 'zh' ? g.zh : g.en}</h3>
            <div className="grid grid-cols-5 gap-2">
              {g.icons.map((i) => (
                <Cell key={i.name} name={i.name} selected={i.name === value} lang={lang} onPick={onChange} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
};

/** The picker in a sheet on top of whatever is open; choosing an icon closes it. */
export const GoalIconSheet: React.FC<{
  value: string;
  onChange: (name: string) => void;
  onClose: () => void;
}> = ({ value, onChange, onClose }) => {
  const t = useT();
  const { lang } = useLanguage();
  return (
    <Sheet title={t.goalEdit.chooseIcon} onClose={onClose} z={60} height="tall">
      <GoalIconPicker
        value={value}
        lang={lang}
        onChange={(name) => {
          onChange(name);
          onClose();
        }}
      />
    </Sheet>
  );
};

/**
 * The icon field of the goal forms: eight quick icons and a More tile that
 * opens the whole catalogue, with the chosen icon's group named underneath.
 */
export const GoalIconRow: React.FC<{ value: string; onChange: (name: string) => void }> = ({ value, onChange }) => {
  const t = useT();
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const group = iconGroupOf(value);

  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {quickIconsFor(value).map((name) => (
          <Cell key={name} name={name} selected={name === value} lang={lang} onPick={onChange} />
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t.goalEdit.chooseIcon}
          className="grid aspect-square min-h-11 w-full place-items-center rounded-2xl bg-card text-ink active:opacity-70"
        >
          <span className="flex flex-col items-center gap-0.5">
            <Icon name="more" size={20} />
            <span className="text-[10.5px] font-bold text-mute">{t.goalEdit.iconMore}</span>
          </span>
        </button>
      </div>
      {group && (
        <p className="mt-2 px-1 text-xs font-semibold text-mute">{t.goalEdit.iconGroup(lang === 'zh' ? group.zh : group.en)}</p>
      )}
      {open && <GoalIconSheet value={value} onChange={onChange} onClose={() => setOpen(false)} />}
    </div>
  );
};

export default GoalIconPicker;
