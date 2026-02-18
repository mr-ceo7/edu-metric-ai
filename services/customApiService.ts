/**
 * Custom API Service — wraps the Flask-based AI Gateway API
 * as a fallback when the @google/genai SDK is unavailable.
 *
 * Endpoints used:
 *   POST /api/upload   — upload file (text or image)
 *   POST /api/generate — query uploaded files with a prompt
 */

const getBaseUrl = (): string => {
  return (process.env.CUSTOM_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
};

/**
 * Upload a file to the Custom API.
 * Returns the stored filename and (for PDFs) the extracted text filename.
 */
export const uploadFile = async (
  blob: Blob,
  filename: string
): Promise<{ filename: string; extracted_txt?: string; size: number }> => {
  const formData = new FormData();
  formData.append('file', blob, filename);

  const res = await fetch(`${getBaseUrl()}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Custom API upload failed (${res.status}): ${errorText}`);
  }

  return res.json();
};

/**
 * Generate a response from the Custom API using previously uploaded files.
 * Returns the raw response text.
 */
export const generate = async (
  prompt: string,
  files: string[]
): Promise<string> => {
  const res = await fetch(`${getBaseUrl()}/api/generate`, {
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
