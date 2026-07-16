/**
 * Copyright IBM Corp. 2025, 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * FE-03 — Upload service
 *
 * Sends a File to the backend upload endpoint and returns the new contract
 * record on success.  On failure it returns a structured error containing
 * only the human-readable message from the backend (no internal detail).
 *
 * @param {File} file - The PDF or DOCX file to upload.
 * @returns {Promise<{id: string, fileName: string, uploadedAt: string, status: string}>}
 */
export const uploadContract = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  let response;
  try {
    response = await fetch('http://localhost:3001/uploads', {
      method: 'POST',
      body: formData,
    });
  } catch {
    const message =
      'Upload failed. Please check your connection and try again.';
    console.error('[contracts] upload request failed:', message);
    throw new Error(message);
  }

  if (!response.ok) {
    let message = 'Upload failed. Please try again.';
    try {
      const body = await response.json();
      // Backend uses { error: "..." } — surface it as the message
      if (body && body.error) {
        message = body.error;
      }
    } catch {
      // Non-JSON error body — keep generic message
    }
    console.error('[contracts] upload error:', message);
    throw new Error(message);
  }

  const raw = await response.json();
  // Normalise snake_case backend fields to camelCase for the frontend
  return {
    id: raw.id,
    fileName: raw.file_name,
    uploadedAt: raw.uploaded_at,
    status: raw.status,
  };
};

/**
 * FE-05 — Queue fetch
 *
 * Fetches all contract records from the backend queue endpoint, ordered
 * newest first.  On failure logs a console ERROR and throws so the caller
 * can decide whether to preserve existing state.
 *
 * @returns {Promise<Array<{id: string, fileName: string, uploadedAt: string, status: string}>>}
 */
export const fetchContracts = async () => {
  let response;
  try {
    response = await fetch('http://localhost:3001/queue');
  } catch {
    const message =
      'Failed to load contract queue. Please check your connection.';
    console.error('[contracts] queue fetch failed:', message);
    throw new Error(message);
  }

  if (!response.ok) {
    const message = 'Failed to load contract queue.';
    console.error('[contracts] queue fetch error:', message);
    throw new Error(message);
  }

  const rows = await response.json();
  // Normalise snake_case backend fields to camelCase for the frontend
  return rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    uploadedAt: row.uploaded_at,
    status: row.status,
  }));
};
