import { describe, expect, it } from 'vitest';

import { CORE_PACKAGE_NAME, coreHealth } from '../src/index';

describe('@larder/core smoke', () => {
  it('exports a stable package name', () => {
    expect(CORE_PACKAGE_NAME).toBe('@larder/core');
  });

  it('coreHealth reports ok', () => {
    expect(coreHealth()).toEqual({ ok: true, package: '@larder/core' });
  });
});
