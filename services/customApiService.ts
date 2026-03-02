/**
 * Custom API Service — wraps the Flask-based AI Gateway API
 * as a fallback when the @google/genai SDK is unavailable.
 *
 * Endpoints used:
 *   POST /api/upload   — upload file (text or image)
 *   POST /api/generate — query uploaded files with a prompt
 *
 * All requests use retry with exponential backoff for resilience.
 */

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000; // 1s, 2s, 4s

const isProduction = (): boolean =>
  typeof window !== 'undefined' && window.location.protocol === 'https:';

const getBaseUrl = (): string => {
  // In production (Vercel HTTPS), use same-origin proxy to avoid Mixed Content
  if (isProduction()) {
    return '';  // relative URLs → /api/proxy/upload, /api/proxy/generate
  }
  return (process.env.CUSTOM_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
};

// On HTTPS (Vercel) use proxy paths; on localhost use direct Flask paths
const getApiPath = (endpoint: string): string =>
  isProduction() ? `/api/proxy/${endpoint}` : `/api/${endpoint}`;

/**
 * Retry wrapper with exponential backoff.
 * Retries on network errors and 5xx server errors, but NOT on 4xx client errors.
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  retries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on 4xx client errors (bad request, auth, etc.)
      const is4xx = lastError.message.includes('(4');
      if (is4xx) {
        console.error(`[CustomAPI] ${label} failed with client error, not retrying:`, lastError.message);
        throw lastError;
      }

      if (attempt < retries) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[CustomAPI] ${label} attempt ${attempt}/${retries} failed, retrying in ${delay}ms...`, lastError.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`[CustomAPI] ${label} failed after ${retries} attempts:`, lastError.message);
      }
    }
  }

  throw lastError || new Error(`${label} failed after ${retries} attempts`);
}

/**
 * Upload a file to the Custom API.
 * Returns the stored filename and (for PDFs) the extracted text filename.
 */
export const uploadFile = async (
  blob: Blob,
  filename: string
): Promise<{ filename: string; extracted_txt?: string; size: number }> => {
  return withRetry(async () => {
    const formData = new FormData();
    formData.append('file', blob, filename);

    const res = await fetch(`${getBaseUrl()}${getApiPath('upload')}`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Custom API upload failed (${res.status}): ${errorText}`);
    }

    return res.json();
  }, `upload(${filename})`);
};

/**
 * Generate a response from the Custom API using previously uploaded files.
 * Returns the raw response text.
 */
export const generate = async (
  prompt: string,
  files: string[]
): Promise<string> => {
  return withRetry(async () => {
    const res = await fetch(`${getBaseUrl()}${getApiPath('generate')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, files, stream: false }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Custom API generate failed (${res.status}): ${errorText}`);
    }

    const data = await res.json();
    return data.response || '';
  }, 'generate');
};

/**
 * Convenience: upload a blob then immediately generate with a prompt.
 * Returns the raw response text from the AI.
 */
export const uploadAndGenerate = async (
  prompt: string,
  blob: Blob,
  filename: string
): Promise<string> => {
  const uploadResult = await uploadFile(blob, filename);
  // Prefer extracted text file for PDFs, otherwise use the stored filename
  const fileRef = uploadResult.extracted_txt || uploadResult.filename;
  return generate(prompt, [fileRef]);
};

/**
 * Generate without uploading any files (text-only prompt).
 * Sends an empty files array.
 */
export const generateTextOnly = async (prompt: string): Promise<string> => {
  return generate(prompt, []);
};
