import { describe, expect, test } from '@jest/globals';
import { retryVolumeAccess } from '../../eu-reski-news/news-scene/volume-access-retry.mjs';

const volumePath = '/Volumes/DAILYDOASE_MEDIA/campaign';
const failure = (code, path) => Object.assign(new Error(code), { code, path });

describe('campaign volume recovery', () => {
  test('retries transient volume access failures until the operation succeeds', async () => {
    let attempts = 0;
    const reports = [];
    const result = await retryVolumeAccess(() => {
      if (++attempts < 3) throw failure('EPERM', `${volumePath}/.exhibition-runner.lock`);
      return 'started';
    }, { volumePath, wait: async () => {}, isStopping: () => false, report: (error) => reports.push(error.code) });
    expect(result).toBe('started');
    expect(reports).toEqual(['EPERM', 'EPERM']);
    expect(attempts).toBe(3);
  });

  test('does not retry unrelated errors or errors after the generator has started', async () => {
    for (const error of [failure('EPERM', '/other/path'), failure('EINVAL', `${volumePath}/lock`), Object.assign(failure('EPERM', `${volumePath}/lock`), { volumeRetryForbidden: true })]) {
      await expect(retryVolumeAccess(() => { throw error; }, { volumePath, wait: async () => {}, isStopping: () => false, report: () => {} })).rejects.toBe(error);
    }
  });

  test('stops waiting when the user stops the generator', async () => {
    let stopped = false;
    let attempts = 0;
    await retryVolumeAccess(() => { attempts += 1; throw failure('EPERM', `${volumePath}/lock`); }, {
      volumePath, wait: async () => { stopped = true; }, isStopping: () => stopped, report: () => {},
    });
    expect(attempts).toBe(1);
  });
});
