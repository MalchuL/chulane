/** Public data and callback contracts for select-field. */

export type SelectFieldProps = {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
};
