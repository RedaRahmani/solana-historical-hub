/** @jest-environment jsdom */

const UI = require('../../public/ui.js');

describe('UI Interactions', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="queryForm">
        <select id="method"><option value="getBlock"></option></select>
        <textarea id="params">[419899999, {"encoding":"json"}]</textarea>
        <button type="submit" id="runBtn"></button>
      </form>
      <div id="queryLoading" class="hidden"></div>
      <div id="resultJson" class="hidden"></div>
      <pre id="queryResult"></pre>

      <div id="paymentModal" class="modal"></div>
      <div id="paymentProgress" class="hidden"></div>
      <span id="paymentAmount"></span>
      <span id="paymentAsset"></span>
      <span id="paymentAddress"></span>
      <span id="paymentId"></span>
      <span id="paymentMethod"></span>
      <button id="payButton"></button>
      <div id="step-connect" class="step"><span class="step-dot"></span></div>
      <div id="step-sign" class="step"><span class="step-dot"></span></div>
      <div id="step-confirm" class="step"><span class="step-dot"></span></div>
      <div id="step-retry" class="step"><span class="step-dot"></span></div>
    `;
  });

  test('handleQuerySubmit opens payment modal on 402', async () => {
    const spyOpen = jest.spyOn(UI, 'openPaymentModal').mockImplementation(() => {});
    global.fetch = jest.fn(async () => ({ status: 402, ok: false, json: async () => ({ accepts: [{ amount: '0.001', asset: 'USDC', paymentAddress: 'dest', paymentId: 'id' }] }) }));
    const form = document.getElementById('queryForm');
    await UI.handleQuerySubmit({ preventDefault(){} });
    expect(spyOpen).toHaveBeenCalled();
    spyOpen.mockRestore();
  });

  test('openPaymentModal populates fields and shows modal', () => {
    const resp = { accepts: [{ amount: '0.002', asset: 'USDC', chain: 'solana-devnet', paymentAddress: 'abc', paymentId: 'pid', method: 'getBlock' }] };
    UI.openPaymentModal(resp, 'getBlock', [1]);
    expect(document.getElementById('paymentAmount').textContent).toContain('0.002');
    expect(document.getElementById('paymentAsset').textContent).toContain('USDC');
    expect(document.getElementById('paymentMethod').textContent).toContain('getBlock');
    expect(document.getElementById('paymentModal').classList.contains('modal--show')).toBe(true);
  });

  test('setActiveStep highlights current step', () => {
    UI.setActiveStep('step-sign');
    expect(document.getElementById('step-sign').classList.contains('step--active')).toBe(true);
    expect(document.getElementById('step-connect').classList.contains('step--active')).toBe(false);
  });
});

