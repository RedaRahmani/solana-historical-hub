/** @jest-environment jsdom */

const UI = require('../../public/ui.js');

describe('Result View Container', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="resultJson" class="hidden">
        <details id="resultDetails" open>
          <div class="result-container">
            <pre id="queryResult" class="language-json text-xs"></pre>
          </div>
        </details>
      </div>
      <div id="resultLoading" class="hidden"></div>
    `;
  });

  test('renderResult populates JSON and shows container', () => {
    const data = { a: 1, b: { c: [1,2,3] } };
    UI.renderResult(data);
    expect(document.getElementById('resultJson').classList.contains('hidden')).toBe(false);
    const pre = document.getElementById('queryResult');
    expect(pre.textContent.includes('"a": 1')).toBe(true);
    // container exists and is scrollable by class
    const container = document.querySelector('.result-container');
    expect(container).not.toBeNull();
  });

  test('copyResult uses clipboard API when available', async () => {
    const pre = document.getElementById('queryResult');
    pre.textContent = '{"ok":true}';
    global.navigator.clipboard = { writeText: jest.fn(async () => {}) };
    await UI.copyResult();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('{"ok":true}');
  });

  test('toggleResult toggles details open', () => {
    document.body.innerHTML += '<button id="resultToggleBtn">Collapse</button>';
    const det = document.getElementById('resultDetails');
    UI.toggleResult();
    expect(det.open).toBe(false);
    UI.toggleResult();
    expect(det.open).toBe(true);
  });
});

