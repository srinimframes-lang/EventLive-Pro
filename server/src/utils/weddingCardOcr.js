import { createWorker } from 'tesseract.js';

const OCR_TIMEOUT_MS = 45_000;

/**
 * Read English text from a wedding-card image. Returns '' on failure so the
 * caller can still show an empty editable form instead of saving guesses.
 *
 * @param {string|Buffer} image
 * @returns {Promise<string>}
 */
export async function recognizeWeddingCardImage(image) {
  if (!image) return '';

  const worker = await createWorker('eng');
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '4',
      preserve_interword_spaces: '1',
    });
    const recognized = worker.recognize(image);
    const timedOut = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OCR timed out')), OCR_TIMEOUT_MS);
    });
    const { data } = await Promise.race([recognized, timedOut]);
    return String(data?.text || '').trim();
  } finally {
    await worker.terminate().catch(() => {});
  }
}
