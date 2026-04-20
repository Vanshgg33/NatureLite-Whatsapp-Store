export const WA = {
  BUTTON_TITLE: 20,
  LIST_ROW_TITLE: 24,
  LIST_ROW_DESC: 72,
  LIST_SECTION_TITLE: 24,
  LIST_BUTTON: 20,
  BODY: 1024,
  HEADER: 60,
  FOOTER: 60,
  MAX_BUTTONS: 3,
  MAX_ROWS_PER_SECTION: 10,
} as const;

export const clip = (s: string | undefined, n: number) =>
  (s ?? '').slice(0, n);
