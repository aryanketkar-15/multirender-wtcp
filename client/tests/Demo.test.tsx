import { render, screen } from '@testing-library/react';
import { DemoSteps, DemoVerification, alterSealedParagraph } from '../src/components/DemoKit';
import * as verifierClient from '../src/lib/verifierClient';

const mismatch: verifierClient.VerificationResult = {
  ok: false,
  verdict: 'DIGEST_MISMATCH',
  passedStages: 10,
  failedStage: 11,
  stages: [],
  message: 'differs',
};

describe('live demo kit', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('marks finished steps and the current one', () => {
    render(<DemoSteps current={3} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveClass('done');
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(items[3]).toHaveClass('next');
  });

  it('rewrites the first paragraph of the sealed region, and only when it exists', () => {
    expect(alterSealedParagraph()).toBe(false);
    document.body.innerHTML = '<div id="consent-region"><p>Original</p><p>Second</p></div>';
    expect(alterSealedParagraph()).toBe(true);
    const paragraphs = document.querySelectorAll('#consent-region p');
    expect(paragraphs[0].textContent).toBe('We will never share your data with anyone.');
    expect(paragraphs[1].textContent).toBe('Second');
  });

  it('downloads the new pack and shows the verifier verdict', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) });
    jest.spyOn(verifierClient, 'uploadAndVerifyPack').mockResolvedValue(mismatch);
    render(<DemoVerification packId="pk1" />);
    expect(await screen.findByText(/10 of 11 stages passed/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/pack/pk1/download');
  });

  it('explains what to check when there is no pack or the verifier is down', async () => {
    render(<DemoVerification packId={null} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/port 8095/);
  });
});
