/** @jest-environment jsdom */

const UI = require('../../public/ui.js');

describe('Methods dropdown and hints', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <select id="method">
        <option value="getBlock">getBlock</option>
        <option value="getProgramAccounts">getProgramAccounts</option>
      </select>
      <p id="methodHelp"></p>
      <textarea id="params"></textarea>
    `;
  });

  test('Selecting getProgramAccounts sets tip and example', () => {
    UI.initMethodHints();
    const select = document.getElementById('method');
    select.value = 'getProgramAccounts';
    select.dispatchEvent(new Event('change'));
    expect(document.getElementById('methodHelp').textContent).toMatch(/program/i);
    expect(document.getElementById('params').value).toMatch(/filters/);
  });
});

