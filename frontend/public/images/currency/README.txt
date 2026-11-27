Cash counter photo tiles (components/billing/CashCounter.tsx) load these files from here:

  note-10.png note-20.png note-50.png note-100.png note-200.png note-500.png note-2000.png
  coin-1.png coin-2.png coin-5.png coin-10.png coin-20.png

Copy them unchanged from indian-currency-images/ (official RBI / SPMCIL reference samples;
keep the red "SPECIMEN" marks) and put SOURCES.txt beside them for attribution.
A missing file falls back to the drawn note/coin, so the counter works without them.
