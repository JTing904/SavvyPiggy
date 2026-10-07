import { createUndoQueue } from '../services/undoQueue';
import { eq, report } from './harness';

interface Row {
  id: string;
}

/** Timers that only fire when the test says time has passed. */
const clock = () => {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = next++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (h: unknown) => void timers.delete(h as number),
    advance: (ms: number) => {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) {
          timers.delete(id);
          t.fn();
        }
      }
    },
    count: () => timers.size,
  };
};

const setup = (fail = false) => {
  const c = clock();
  const committed: string[] = [];
  const restored: [string, unknown][] = [];
  const queue = createUndoQueue<Row>({
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
    commit: async (item) => {
      committed.push(item.id);
      if (fail) throw new Error('offline');
    },
    onRestore: (item, error) => void restored.push([item.id, error instanceof Error ? error.message : error]),
  });
  return { c, committed, restored, queue };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const main = async () => {
  {
    const { c, committed, queue } = setup();
    queue.push({ id: 'a' }, 'Deleted');
    eq('a waiting delete is pending and hidden', [queue.pending()?.id, [...queue.hiddenIds()]], ['a', ['a']]);
    c.advance(4999);
    eq('nothing is committed before the delay', committed, []);
    eq('undo within the delay succeeds', queue.undo(), true);
    c.advance(10_000);
    await tick();
    eq('an undone delete never commits', committed, []);
    eq('and the row is shown again', [queue.pending(), [...queue.hiddenIds()]], [null, []]);
  }

  {
    const { c, committed, queue } = setup();
    queue.push({ id: 'a' }, 'Deleted');
    c.advance(5000);
    await tick();
    eq('the commit fires at 5 s', committed, ['a']);
    c.advance(60_000);
    await tick();
    eq('and only once', committed, ['a']);
    eq('undo after the commit is a no-op', queue.undo(), false);
    eq('nothing is left hidden once it has been deleted', [...queue.hiddenIds()], []);
  }

  {
    const { c, committed, queue } = setup();
    queue.push({ id: 'a' }, 'One');
    queue.push({ id: 'b' }, 'Two');
    eq('a second delete commits the first at once', committed, ['a']);
    eq('and the second is the one waiting', queue.pending()?.id, 'b');
    c.advance(5000);
    await tick();
    eq('the first timer does not commit it twice', committed, ['a', 'b']);
  }

  {
    const { c, committed, queue } = setup();
    queue.push({ id: 'a' }, 'Deleted');
    await queue.flush();
    eq('flush commits immediately', committed, ['a']);
    c.advance(10_000);
    await tick();
    eq('and the timer does not commit again', committed, ['a']);
    eq('flush with nothing waiting is harmless', await queue.flush(), undefined);
  }

  {
    const { c, restored, queue } = setup(true);
    queue.push({ id: 'a' }, 'Deleted');
    c.advance(5000);
    await tick();
    eq('a failed commit restores the row with the error', restored, [['a', 'offline']]);
    eq('and stops hiding it', [...queue.hiddenIds()], []);
  }

  {
    const { committed, restored, queue } = setup(true);
    queue.push({ id: 'a' }, 'Deleted');
    await queue.flush();
    eq('a failed flush restores the row too', [committed, restored], [['a'], [['a', 'offline']]]);
  }

  report();
};

void main();
