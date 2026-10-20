// Toolbar click arms or disarms the attack. The badge shows the state so the presenter can see it.
function show(armed) {
  chrome.action.setBadgeText({ text: armed ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#b3261e' });
  chrome.action.setTitle({
    title: armed ? 'MRA demo attack: ARMED. Click to disarm.' : 'MRA demo attack: off. Click to arm.',
  });
}

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get({ armed: false }, ({ armed }) => show(armed));
});

chrome.action.onClicked.addListener(() => {
  chrome.storage.local.get({ armed: false }, ({ armed }) => {
    chrome.storage.local.set({ armed: !armed });
    show(!armed);
  });
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.armed) show(Boolean(changes.armed.newValue));
});
