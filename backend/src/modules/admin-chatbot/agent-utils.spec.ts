import { responseText, historyToContent, withTimeout, capArrays } from './agent-utils';

describe('responseText', () => {
  it('returns trimmed text from the SDK getter', () => {
    expect(responseText({ text: '  hello  ' })).toBe('hello');
  });

  it('returns empty string when text is undefined', () => {
    expect(responseText({})).toBe('');
  });

  it('falls back to candidate parts when the SDK getter throws on null thinking parts', () => {
    const r = {
      get text(): string {
        throw new Error('null part');
      },
      candidates: [
        {
          content: {
            parts: [null, { text: 'thinking', thought: true }, { text: 'answer ' }, { text: 'here' }],
          },
        },
      ],
    };
    expect(responseText(r)).toBe('answer here');
  });
});

describe('historyToContent', () => {
  it('maps assistant to the model role', () => {
    const out = historyToContent([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ]);
    expect(out).toEqual([
      { role: 'user', parts: [{ text: 'hi' }] },
      { role: 'model', parts: [{ text: 'hello' }] },
    ]);
  });

  it('drops leading model turns because Gemini rejects history that starts with one', () => {
    const out = historyToContent([
      { role: 'assistant', text: 'stale' },
      { role: 'user', text: 'q' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('user');
  });

  it('returns an empty array for empty history', () => {
    expect(historyToContent([])).toEqual([]);
  });
});

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves with the value when the promise settles first', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it('rejects with gemini_timeout when the promise is too slow', async () => {
    const never = new Promise<number>(() => {});
    const pending = withTimeout(never, 1000);
    const assertion = expect(pending).rejects.toThrow('gemini_timeout');
    jest.advanceTimersByTime(1000);
    await assertion;
  });

  it('does not leave a timer running after the promise resolves', async () => {
    await withTimeout(Promise.resolve('ok'), 30_000);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('capArrays', () => {
  it('truncates arrays longer than max and leaves other values alone', () => {
    const out = capArrays({ rows: [1, 2, 3, 4], total: 4, name: 'x' }, 2);
    expect(out).toEqual({ rows: [1, 2], total: 4, name: 'x' });
  });

  it('keeps arrays at or under max unchanged', () => {
    const rows = [1, 2];
    expect(capArrays({ rows }, 2).rows).toBe(rows);
  });
});
