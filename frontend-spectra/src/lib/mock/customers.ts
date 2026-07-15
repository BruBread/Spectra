import type { Customer, CustomerStatus } from '../types';
import { createRng, intBetween, weightedPick } from './rng';
import { FIRST_NAMES, LAST_NAMES } from './names';
import { MOCK_ANCHOR } from './constants';

const STATUS_WEIGHTS: Array<[CustomerStatus, number]> = [
  ['active', 70],
  ['inactive', 20],
  ['pending', 10],
];

export function generateCustomers(seed = 11, count = 64): Customer[] {
  const rng = createRng(seed);
  const usedEmails = new Set<string>();

  return Array.from({ length: count }, (_, index) => {
    const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
    let email = `${first.toLowerCase()}.${last.toLowerCase()}@email.com`;
    let suffix = 1;
    while (usedEmails.has(email)) {
      suffix += 1;
      email = `${first.toLowerCase()}.${last.toLowerCase()}${suffix}@email.com`;
    }
    usedEmails.add(email);

    const joinedDaysAgo = intBetween(rng, 1, 360);
    const phone = `(${intBetween(rng, 200, 989)}) ${intBetween(rng, 200, 989)}-${String(intBetween(rng, 0, 9999)).padStart(4, '0')}`;

    return {
      id: `CUST-${String(index + 1).padStart(3, '0')}`,
      name: `${first} ${last}`,
      email,
      phone,
      status: weightedPick(rng, STATUS_WEIGHTS),
      joinedOn: new Date(MOCK_ANCHOR - joinedDaysAgo * 86_400_000).toISOString(),
    };
  }).sort((a, b) => new Date(b.joinedOn).getTime() - new Date(a.joinedOn).getTime());
}
