/** Public data and callback contracts for feedback. */

export type FeedbackProps = {
  state: "empty" | "loading" | "error";
  message: string;
  onRetry?: () => void;
};
