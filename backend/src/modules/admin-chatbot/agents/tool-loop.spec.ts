import { Logger } from '@nestjs/common';
import { runToolLoop } from './tool-loop';

const textReply = (t: string) => ({ text: t, candidates: [{ content: { parts: [{ text: t }] } }] });
const callReply = (...calls: Array<{ name: string; args?: Record<string, unknown> }>) => ({
  text: '',
  candidates: [{ content: { parts: calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })) } }],
});

function setup(responses: unknown[], execute: jest.Mock = jest.fn().mockResolvedValue({ ok: true })) {
  const sendMessage = jest.fn();
  responses.forEach((r) => sendMessage.mockResolvedValueOnce(r));
  const opts = {
    chat: { sendMessage },
    query: 'the question',
    tools: { execute },
    logger: new Logger('test'),
    label: 'TestAgent',
    maxIterations: 3,
    emptyReply: 'No data found.',
  };
  return { sendMessage, execute, opts };
}

describe('runToolLoop', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'log').mockImplementation());

  it('returns the model text when it answers without calling a tool', async () => {
    const { opts, execute } = setup([textReply('42 orders')]);
    await expect(runToolLoop(opts)).resolves.toBe('42 orders');
    expect(execute).not.toHaveBeenCalled();
  });

  it('sends the user query as the first message', async () => {
    const { opts, sendMessage } = setup([textReply('done')]);
    await runToolLoop(opts);
    expect(sendMessage).toHaveBeenNthCalledWith(1, { message: 'the question' });
  });

  it('runs requested tools and feeds their results back to the model', async () => {
    const execute = jest.fn().mockResolvedValue({ total: 3 });
    const { opts, sendMessage } = setup(
      [callReply({ name: 'get_billing_bills', args: { paymentStatus: 'unpaid' } }), textReply('3 unpaid bills')],
      execute,
    );
    await expect(runToolLoop(opts)).resolves.toBe('3 unpaid bills');
    expect(execute).toHaveBeenCalledWith('get_billing_bills', { paymentStatus: 'unpaid' });
    expect(sendMessage.mock.calls[1][0].message).toEqual([
      { functionResponse: { name: 'get_billing_bills', response: { total: 3 } } },
    ]);
  });

  it('passes an empty args object when the model calls a no-parameter tool', async () => {
    const { opts, execute } = setup([callReply({ name: 'get_crm_overview' }), textReply('ok')]);
    await runToolLoop(opts);
    expect(execute).toHaveBeenCalledWith('get_crm_overview', {});
  });

  it('executes every tool the model asks for in a single turn', async () => {
    const { opts, execute, sendMessage } = setup([
      callReply({ name: 'a', args: {} }, { name: 'b', args: { x: 1 } }),
      textReply('both'),
    ]);
    await runToolLoop(opts);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[1][0].message).toHaveLength(2);
  });

  it('reports a failing tool to the model as an error result instead of aborting', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('db down'));
    const { opts, sendMessage } = setup([callReply({ name: 'a', args: {} }), textReply('could not fetch')], execute);
    await expect(runToolLoop(opts)).resolves.toBe('could not fetch');
    expect(sendMessage.mock.calls[1][0].message[0].functionResponse.response).toEqual({ error: 'db down' });
  });

  it('caps long arrays in tool results at 25 entries', async () => {
    const execute = jest.fn().mockResolvedValue({ rows: Array.from({ length: 80 }, (_, i) => i), total: 80 });
    const { opts, sendMessage } = setup([callReply({ name: 'a', args: {} }), textReply('ok')], execute);
    await runToolLoop(opts);
    const sent = sendMessage.mock.calls[1][0].message[0].functionResponse.response;
    expect(sent.rows).toHaveLength(25);
    expect(sent.total).toBe(80);
  });

  it('forces a text summary when the model is still calling tools after the iteration limit', async () => {
    const loopCall = callReply({ name: 'a', args: {} });
    const { opts, sendMessage } = setup([loopCall, loopCall, loopCall, loopCall, textReply('here is what I found')]);
    await expect(runToolLoop(opts)).resolves.toBe('here is what I found');
    expect(sendMessage).toHaveBeenLastCalledWith({ message: 'Summarize what you found so far.' });
  });

  it('returns the empty-reply fallback when the model answers with no text', async () => {
    const { opts } = setup([textReply('')]);
    await expect(runToolLoop(opts)).resolves.toBe('No data found.');
  });

  it('returns the empty-reply fallback when the forced summary has no text either', async () => {
    const { opts } = setup([callReply({ name: 'a', args: {} }), callReply({ name: 'a', args: {} }), textReply('')]);
    opts.maxIterations = 1;
    await expect(runToolLoop(opts)).resolves.toBe('No data found.');
  });
});
