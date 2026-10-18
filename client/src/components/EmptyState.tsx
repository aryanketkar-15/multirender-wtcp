/**
 * EmptyState — shown when a list has no items.
 *
 * T7.2.1: every list page renders this when the data array is empty.
 * Design: centred illustration (CSS/SVG), heading, one-line explanation,
 * and a single next-action link or button. No stock imagery.
 */
import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Icon element — should be an inline SVG or the Icon component */
  icon?: ReactNode;
  /** Short heading, e.g. "No evidence packs yet" */
  heading: string;
  /** One-sentence explanation of what goes here */
  body: string;
  /** Optional call-to-action button or link */
  action?: ReactNode;
}

export function EmptyState({ icon, heading, body, action }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      {icon ? <div className="empty-state-icon" aria-hidden="true">{icon}</div> : null}
      <p className="empty-state-heading">{heading}</p>
      <p className="empty-state-body">{body}</p>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
