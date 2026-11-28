/** Two host-provided revisions for a readable, expandable comparison. */
export type ChangeDiffProps = {
  before: string;
  after: string;
  label?: string;
  compact?: boolean;
};
