/** @jest-environment jsdom */

const UI = require('../../public/ui.js');

describe('UI Components', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="themeToggle"></button>
      <div id="providersWrap"></div>
      <table><tbody id="providersTable"></tbody></table>
      <div id="providersEmpty" class="hidden"></div>
    `;
    // reset localStorage mock
    Object.defineProperty(window, 'localStorage', {
      value: (() => {
        let store = {};
        return {
          getItem: (k) => store[k],
          setItem: (k,v) => { store[k] = String(v); },
          removeItem: (k) => { delete store[k]; },
          clear: () => { store = {}; },
        };
      })(),
      configurable: true,
      writable: true,
    });
  });

  test('dark/light theme toggle updates class and localStorage', () => {
    const root = document.documentElement;
    UI.initTheme();
    const btn = document.getElementById('themeToggle');
    expect(root.classList.contains('dark')).toBe(false);
    btn.click();
    expect(root.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('theme')).toBe('dark');
    btn.click();
    expect(root.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('theme')).toBe('light');
  });

  test('renderProviders and sortProvidersBy work', () => {
    const sample = [
      { name: 'A', type: 'http', pricing: 1.2, reputation: 65 },
      { name: 'B', type: 'http', pricing: 0.8, reputation: 90 },
      { name: 'C', type: 'ws', pricing: 1.5, reputation: 50 }
    ];
    // simulate cache
    UI.renderProviders(sample);
    const rows = document.querySelectorAll('#providersTable tr');
    expect(rows.length).toBe(3);
    // hook cache to module via loadProviders pattern
    const mod = require('../../public/ui.js');
    // emulate cache internal value and sort by reputation
    mod.__providersTestCache = sample; // hint not used; we call API directly
    UI.sortProvidersBy('reputation');
    const firstName = document.querySelector('#providersTable tr td').textContent;
    // highest reputation (90) should be first after sort
    expect(firstName).toBe('B');
  });
});

