/**
 * Copyright IBM Corp. 2025, 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useState, useRef } from 'react';
import { FileUploader, Button, InlineNotification, Stack } from '@carbon/react';

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx'];

/**
 * FE-02 — Upload form with client-side file type validation.
 *
 * Validates the selected file extension (case-insensitive) and calls the
 * onSubmit prop when validation passes and the form is submitted.
 * The onSubmit handler is responsible for the actual HTTP call (FE-03).
 *
 * @param {Object}   props
 * @param {Function} props.onSubmit   - Called with the valid File object on submission.
 * @param {boolean}  props.isUploading - When true the submit button is disabled.
 * @param {string}   [props.uploadError] - Backend/network error message to display.
 * @param {Function} props.onErrorDismiss - Called when the error notification is closed.
 */
export const UploadForm = ({
  onSubmit,
  isUploading,
  uploadError,
  onErrorDismiss,
}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [validationError, setValidationError] = useState('');
  const uploaderRef = useRef(null);

  const validateExtension = (file) => {
    if (!file) return false;
    const name = file.name.toLowerCase();
    return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      setValidationError('');
      return;
    }

    if (!validateExtension(file)) {
      setValidationError('Only PDF and DOCX files are accepted.');
      console.warn('[upload] file rejected (client-side):', {
        fileName: file.name,
        reason: 'Unsupported file type',
      });
      setSelectedFile(null);
      return;
    }

    setValidationError('');
    setSelectedFile(file);
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!selectedFile) {
      setValidationError('Please select a PDF or DOCX file before uploading.');
      return;
    }

    if (!validateExtension(selectedFile)) {
      setValidationError('Only PDF and DOCX files are accepted.');
      console.warn('[upload] file rejected (client-side):', {
        fileName: selectedFile.name,
        reason: 'Unsupported file type',
      });
      return;
    }

    onSubmit(selectedFile);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setValidationError('');
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack gap={5}>
        <div className="cs--upload-form__file-input">
          <FileUploader
            ref={uploaderRef}
            labelTitle="Upload a contract"
            labelDescription="Accepted formats: PDF, DOCX. Maximum one file per upload."
            buttonLabel="Select file"
            buttonKind="tertiary"
            filenameStatus="edit"
            accept={['.pdf', '.docx']}
            multiple={false}
            disabled={isUploading}
            iconDescription="Remove selected file"
            name="contract-file"
            onChange={handleFileChange}
            onDelete={handleClearFile}
          />
        </div>

        {validationError && (
          <p
            className="cs--upload-form__validation-error"
            role="alert"
            aria-live="polite"
          >
            {validationError}
          </p>
        )}

        {uploadError && (
          <InlineNotification
            kind="error"
            title="Upload failed"
            subtitle={uploadError}
            onCloseButtonClick={onErrorDismiss}
            lowContrast
          />
        )}

        <Button type="submit" disabled={isUploading || !selectedFile}>
          {isUploading ? 'Uploading…' : 'Upload contract'}
        </Button>
      </Stack>
    </form>
  );
};
