import { afterEach, describe, expect, it } from 'vitest';
import { clearRoomPositions, readPosition, writePosition } from './media-position';

describe('media positions', () => {
  afterEach(() => sessionStorage.clear());

  it('a new lobby forgets the room’s last run, never another room’s', () => {
    writePosition('771122:0:/api/v1/media/a', { t: 12, ended: true });
    writePosition('771122:1:/api/v1/media/b', { t: 3, ended: false });
    writePosition('998877:0:/api/v1/media/a', { t: 5, ended: false });
    clearRoomPositions('771122');
    // Played again in the same room, question 0 starts: nothing says it already ended.
    expect(readPosition('771122:0:/api/v1/media/a')).toBeNull();
    expect(readPosition('771122:1:/api/v1/media/b')).toBeNull();
    expect(readPosition('998877:0:/api/v1/media/a')).toEqual({ t: 5, ended: false });
  });
});
