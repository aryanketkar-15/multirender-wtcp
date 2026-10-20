/** Said on the sign-in and sign-up pages: what happens to a consent choice once it is made. */
export function RecordsNotice() {
  return (
    <aside className="records-notice" aria-label="About the records this app keeps">
      <strong>These records are real.</strong> When you accept or reject the consent notice, your
      choice is saved as signed evidence of what your browser displayed, and its fingerprint is
      added to an append-only log, so it cannot be quietly changed afterwards. Use a test account
      unless you mean to keep the record.
    </aside>
  );
}
