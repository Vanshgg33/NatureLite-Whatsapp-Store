Cash counter photo tiles (components/billing/CashCounter.tsx) load these files:

  note-10.png note-20.png note-50.png note-100.png note-200.png note-500.png note-2000.png
  coin-1.png coin-2.png coin-5.png coin-10.png coin-20.png

The current files were cut, unaltered, from the photo-tiles design preview, which uses official
RBI / SPMCIL reference images (SPECIMEN marks kept). They are small (200x59 notes, 30x30 coins).
To use the full-size originals, overwrite these files with the same names from indian-currency-images/
and add its SOURCES.txt here. A missing file falls back to the drawn note/coin.
