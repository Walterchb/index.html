# Bundled OCR language data

English and Spanish Tesseract trained data were downloaded from the Tesseract.js language-data distribution on 2026-09-22:

- `eng.traineddata.gz`: https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz
- `spa.traineddata.gz`: https://tessdata.projectnaptha.com/4.0.0/spa.traineddata.gz

Language data are distributed under Apache-2.0 (see LICENSE and https://github.com/tesseract-ocr/tessdata).

The adjacent `vendor/tesseract-core` contains tesseract.js-core 6.1.2 WebAssembly variants, vendored from the npm package locked in package-lock.json. No OCR document content is transmitted to an external service.
