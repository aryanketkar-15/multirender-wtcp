const button = document.getElementById('toggle');
const state = document.getElementById('state');

function render(armed) {
  button.setAttribute('aria-pressed', String(armed));
  button.textContent = armed ? 'Disarm the attack' : 'Arm the attack';
  state.textContent = armed ? 'Armed: the next consent notice will be rewritten.' : 'Off: pages are left alone.';
}

chrome.storage.local.get({ armed: false }, ({ armed }) => render(armed));
button.addEventListener('click', () => {
  chrome.storage.local.get({ armed: false }, ({ armed }) => {
    chrome.storage.local.set({ armed: !armed }, () => render(!armed));
  });
});
