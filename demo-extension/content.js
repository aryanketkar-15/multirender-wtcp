// Behaves like malicious software would: waits until the consent notice is on screen and the user
// has had time to see it, then silently rewrites the disclosure paragraph. It touches only the
// page in this browser. The server's record and the signed bundle are never altered.
const FALSE_PROMISE = 'We will never share your data with anyone.';

chrome.storage.local.get({ armed: false }, ({ armed }) => {
  if (!armed) return;
  const started = Date.now();
  const timer = setInterval(() => {
    if (Date.now() - started > 60000) return clearInterval(timer);
    const paragraph = document.querySelector('#consent-region p');
    if (!paragraph) return;
    clearInterval(timer);
    setTimeout(() => {
      paragraph.textContent = FALSE_PROMISE;
    }, 1500);
  }, 200);
});
