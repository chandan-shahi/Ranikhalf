import { web3 } from '@coral-xyz/anchor';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';

import { Result } from './types';

export function calcNonDecimalValue(value: number, decimals: number): number {
  return Math.trunc(value * Math.pow(10, decimals));
}

export function calcDecimalValue(value: number, decimals: number): number {
  return value / Math.pow(10, decimals);
}
export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
