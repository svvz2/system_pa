import { parseCommand } from '../src/commands.js';
import { describe, expect, it } from 'vitest';

describe('simulator commands', () => {
  it('parses valid slot transitions', () => {
    expect(parseCommand('slot 3 occupied')).toEqual({ type: 'slot', slotNumber: 3, state: 'occupied' });
    expect(parseCommand('slot 6 free')).toEqual({ type: 'slot', slotNumber: 6, state: 'free' });
  });

  it('rejects invalid slots and states', () => {
    expect(parseCommand('slot 7 occupied')).toBeNull();
    expect(parseCommand('slot 2 maybe')).toBeNull();
  });
});
