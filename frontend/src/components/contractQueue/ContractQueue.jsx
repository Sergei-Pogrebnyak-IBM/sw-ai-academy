/**
 * Copyright IBM Corp. 2025, 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Column, Grid, Tag } from '@carbon/react';

/**
 * FE-04 — Contract queue view (pure display component).
 *
 * Accepts an array of contract records and renders a list.
 * Data fetching is handled by the parent component (FE-05 / FE-06).
 *
 * @param {Object}   props
 * @param {Array}    props.contracts - Array of contract records from the backend.
 */
export const ContractQueue = ({ contracts }) => {
  if (!contracts || contracts.length === 0) {
    return (
      <p className="cs--contract-queue__empty">No contracts uploaded yet.</p>
    );
  }

  return (
    <ul className="cs--contract-queue__list" aria-label="Contract queue">
      {contracts.map((contract) => (
        <li key={contract.id} className="cs--contract-queue__item">
          <Grid condensed>
            <Column sm={4} md={4} lg={8}>
              <p className="cs--contract-queue__filename">
                {contract.fileName}
              </p>
              <p className="cs--contract-queue__timestamp">
                Uploaded:{' '}
                {new Date(contract.uploadedAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </Column>

            <Column sm={4} md={2} lg={4}>
              <StatusTag status={contract.status} />
            </Column>

            <Column sm={4} md={2} lg={4}>
              <button
                type="button"
                className="cs--contract-queue__report-btn"
                disabled
                aria-disabled="true"
                title={
                  contract.status === 'Complete'
                    ? 'Open report (not yet implemented)'
                    : 'Report available once processing is complete'
                }
              >
                Open report
              </button>
            </Column>
          </Grid>
        </li>
      ))}
    </ul>
  );
};

/**
 * Renders a Carbon Tag representing the contract processing status.
 * Tag type encodes meaning; text label provides non-color distinction (FR-08 analogue).
 */
const StatusTag = ({ status }) => {
  const type = status === 'Complete' ? 'green' : 'blue';
  return (
    <Tag type={type} size="md">
      {status}
    </Tag>
  );
};
