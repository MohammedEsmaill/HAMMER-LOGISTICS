import {
  isValidContainerNumber,
  normaliseContainerNumber,
} from './container-number';

describe('container number', () => {
  it.each(['MKLU4022447', 'TCLU5965621', 'CSQU3054383'])('accepts %s', (n) =>
    expect(isValidContainerNumber(n)).toBe(true),
  );

  it.each([
    ['wrong check digit', 'MKLU4022448'],
    ['too short', 'MKLU402244'],
    ['bad category letter', 'MKLX4022447'],
    ['lower case', 'mklu4022447'],
  ])('rejects %s', (_why, n) => expect(isValidContainerNumber(n)).toBe(false));

  it('normalises spaces, dashes and case', () =>
    expect(normaliseContainerNumber('mklu 402244-7')).toBe('MKLU4022447'));
});
