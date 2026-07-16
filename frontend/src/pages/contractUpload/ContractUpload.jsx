/**
 * Copyright IBM Corp. 2025, 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useEffect, useState } from 'react';
import { PageHeader } from '@carbon/ibm-products';
import { Column, Grid } from '@carbon/react';

import { PageLayout } from '../../layouts/page-layout.jsx';
import { Footer } from '../../components/footer/Footer.jsx';
import { UploadForm } from '../../components/uploadForm/UploadForm.jsx';
import { ContractQueue } from '../../components/contractQueue/ContractQueue.jsx';
import { uploadContract, fetchContracts } from '../../api/contracts.js';

const POLL_INTERVAL_MS = 2000;

/**
 * FE-01 / FE-05 / FE-06 — Contract Upload page (root of the upload slice).
 *
 * Owns:
 *  - Contract list state (FE-04 receives it as a prop)
 *  - Status polling loop (FE-05)
 *  - Upload form wiring (FE-06): calls upload service, optimistic-updates queue
 */
const ContractUpload = () => {
  const [contracts, setContracts] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // FE-05 — polling loop.  Defined in the effect to avoid the
  // react-hooks/set-state-in-effect lint error (setState is called inside a
  // subscription callback, not directly in the effect body).
  useEffect(() => {
    let active = true;
    const intervalRef = { current: null };

    const loadQueue = () => {
      fetchContracts()
        .then((data) => {
          if (active) setContracts(data);
        })
        .catch(() => {
          console.error('[ContractUpload] failed to refresh queue');
          // preserve existing state on transient failure
        });
    };

    // Initial fetch on mount
    loadQueue();

    // Polling loop — ≤2 s interval to satisfy NFR-02 / NFR-03
    intervalRef.current = setInterval(loadQueue, POLL_INTERVAL_MS);

    return () => {
      active = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // FE-06 — called by UploadForm when client-side validation passes
  const handleUploadSubmit = async (file) => {
    setIsUploading(true);
    setUploadError('');

    try {
      const newContract = await uploadContract(file);

      // Optimistic update: add the new entry immediately without waiting for
      // the next poll (spec FR-02 AC — "appears in the queue immediately")
      setContracts((prev) => [newContract, ...prev]);
    } catch (error) {
      setUploadError(error.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleErrorDismiss = () => setUploadError('');

  return (
    <PageLayout
      className="cs--contract-upload"
      fallback={<p>Loading contract upload page...</p>}
    >
      <PageHeader
        title="Contract Risk Assessment"
        className="cs--contract-upload__header"
      />

      <Grid className="cs--contract-upload__grid">
        {/* Upload form — left column on wider viewports */}
        <Column sm={4} md={4} lg={6} className="cs--contract-upload__form-col">
          <section aria-labelledby="upload-section-heading">
            <h2
              id="upload-section-heading"
              className="cs--contract-upload__section-heading"
            >
              Upload a contract
            </h2>

            <UploadForm
              onSubmit={handleUploadSubmit}
              isUploading={isUploading}
              uploadError={uploadError}
              onErrorDismiss={handleErrorDismiss}
            />
          </section>
        </Column>

        {/* Contract queue — right column on wider viewports */}
        <Column
          sm={4}
          md={4}
          lg={10}
          className="cs--contract-upload__queue-col"
        >
          <section aria-labelledby="queue-section-heading">
            <h2
              id="queue-section-heading"
              className="cs--contract-upload__section-heading"
            >
              Contract queue
            </h2>

            <ContractQueue contracts={contracts} />
          </section>
        </Column>
      </Grid>

      <Footer />
    </PageLayout>
  );
};

export default ContractUpload;
