import { createSerialQueue } from '@/storage/serial-queue';

/** Accepting a league and renaming a player run one at a time, so a rename can never land after the names are burned. */
export const acceptQueue = createSerialQueue();
