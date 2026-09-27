import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A fake Web Audio graph: each node records what it connects to. */
class FakeNode {
  out: FakeNode[] = [];
  constructor(public kind: string) {}
  connect(next: FakeNode) {
    this.out.push(next);
    return next;
  }
}
class FakeParam {
  value = 1;
  targets: number[] = [];
  setTargetAtTime(v: number) {
    this.targets.push(v);
  }
  /** The fades: where each ramp goes, and from what. */
  ramps: number[] = [];
  setValueAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number) {
    this.ramps.push(v);
  }
  cancelScheduledValues() {}
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
  constructor() {
    super('gain');
  }
}
class FakeContext {
  state = 'running';
  currentTime = 0;
  destination = new FakeNode('destination');
  createGain() {
    return new FakeGain();
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode('limiter'), {
      threshold: new FakeParam(),
      knee: new FakeParam(),
      ratio: new FakeParam(),
      attack: new FakeParam(),
      release: new FakeParam(),
    });
  }
  createMediaElementSource() {
    return new FakeNode('element');
  }
  createBufferSource() {
    return Object.assign(new FakeNode('buffer'), {
      buffer: null,
      loop: false,
      start: vi.fn(),
      stop: vi.fn(),
    });
  }
  resume() {
    return Promise.resolve();
  }
}

/** The kinds met from `node` to the speakers, following the first link each time. */
const pathOf = (node: FakeNode): string[] => {
  const kinds: string[] = [];
  let at: FakeNode | undefined = node;
  while (at) {
    kinds.push(at.kind);
    at = at.out[0];
  }
  return kinds;
};

describe('audio mixer (SPECIFICATIONS-MEDIA §9)', () => {
  let mod: typeof import('./audio-mixer');
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal('AudioContext', FakeContext);
    mod = await import('./audio-mixer');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('plugs every bus into the master, then a limiter, then the speakers', () => {
    for (const bus of mod.BUSES) {
      const input = mod.busInput(bus) as unknown as FakeNode;
      // level → duck → master → limiter → speakers
      expect(pathOf(input)).toEqual(['gain', 'gain', 'gain', 'limiter', 'destination']);
    }
    expect(mod.BUSES).toEqual(['quiz', 'music', 'sfx', 'ui']);
  });

  it('routes a question’s media into the QUIZ bus through its own loudness gain, once', async () => {
    const mixer = mod.getMixer()!;
    const ctx = mixer.ctx as unknown as FakeContext;
    const source = new FakeNode('element');
    const spy = vi.spyOn(ctx, 'createMediaElementSource').mockReturnValue(source);
    const el = {} as HTMLMediaElement;
    await mod.routeElement(el, -6);
    // element → its gain (−6 dB) → the QUIZ bus (level, duck) → master → limiter → speakers
    expect(pathOf(source)).toEqual([
      'element',
      'gain',
      'gain',
      'gain',
      'gain',
      'limiter',
      'destination',
    ]);
    const own = source.out[0] as FakeGain;
    expect(own.gain.value).toBeCloseTo(0.501, 2);
    expect(own.out[0]).toBe(mixer.strips.quiz.level);
    // Routed again (a phone reuses its element): the gain changes, no second source.
    await mod.routeElement(el, 0);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(own.gain.value).toBe(1);
  });

  it('ducks the music apart from its level, so a volume never fights a duck', () => {
    const mixer = mod.getMixer()!;
    const strip = mixer.strips.music as unknown as { level: FakeGain; duck: FakeGain };
    mod.setBusLevel('music', 0.4);
    mod.setBusDucked('music', true);
    expect(strip.level.gain.targets).toEqual([0.4]);
    expect(strip.duck.gain.targets).toEqual([0]);
    mod.setBusDucked('music', false);
    expect(strip.duck.gain.targets).toEqual([0, 1]);
    mod.setBusLevel('sfx', 3); // clamped
    expect((mixer.strips.sfx.level as unknown as FakeGain).gain.targets).toEqual([1]);
  });

  it('mutes the whole page on the master, and plays a buffer into its bus', () => {
    const mixer = mod.getMixer()!;
    mod.setMasterMuted(true);
    expect((mixer.master as unknown as FakeGain).gain.targets).toEqual([0]);
    const stop = mod.playBuffer({} as AudioBuffer, 'sfx');
    const sfxIn = mixer.strips.sfx.level as unknown as FakeNode;
    // A source with its own gain, into the SFX bus.
    expect(typeof stop).toBe('function');
    expect(sfxIn.out[0]).toBe(mixer.strips.sfx.duck);
  });

  it('fades a media in to its own level and out to silence, so nothing clicks', async () => {
    const mixer = mod.getMixer()!;
    const source = new FakeNode('element');
    vi.spyOn(mixer.ctx as unknown as FakeContext, 'createMediaElementSource').mockReturnValue(
      source,
    );
    const el = {} as HTMLMediaElement;
    await mod.routeElement(el, -6);
    const own = source.out[0] as FakeGain;
    mod.muteElementForFade(el);
    expect(own.gain.value).toBe(0);
    await mod.fadeElement(el, 'in');
    expect(own.gain.ramps.at(-1)).toBeCloseTo(0.501, 2); // back to its loudness level, not 1
    await mod.fadeElement(el, 'out');
    expect(own.gain.ramps.at(-1)).toBe(0);
  });

  it('leaves a media alone while the context is suspended (it would be silenced)', async () => {
    const mixer = mod.getMixer()!;
    (mixer.ctx as unknown as FakeContext).state = 'suspended';
    const spy = vi.spyOn(mixer.ctx as unknown as FakeContext, 'createMediaElementSource');
    await mod.routeElement({} as HTMLMediaElement, -3);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('this device’s sound (SPECIFICATIONS-MEDIA §9.2)', () => {
  let mod: typeof import('./audio-mixer');
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    vi.stubGlobal('AudioContext', FakeContext);
    mod = await import('./audio-mixer');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('plays a bus at the room’s level times this device’s trim, and keeps the choice on the device', () => {
    const mixer = mod.getMixer()!;
    const music = mixer.strips.music.level as unknown as FakeGain;
    mod.setRoomLevel('music', 0.5);
    mod.setLocalTrim('music', 0.4);
    // Tapered faders: the gain is each position cubed (0.5³ × 0.4³), not 0.5 × 0.4.
    expect(music.gain.targets.at(-1)).toBeCloseTo(0.125 * 0.064);
    expect(JSON.parse(localStorage.getItem('live.sound')!).trims.music).toBe(0.4);
  });

  it('mutes and sets the volume on the master; a new page starts from what was chosen', async () => {
    mod.setDeviceVolume(0.6);
    mod.setDeviceMuted(true);
    const master = mod.getMixer()!.master as unknown as FakeGain;
    expect(master.gain.targets.at(-1)).toBe(0);
    mod.setDeviceMuted(false);
    expect(master.gain.targets.at(-1)).toBeCloseTo(0.6 ** 3);
    // A reload: the new mixer is built with the device's choice.
    vi.resetModules();
    const again = await import('./audio-mixer');
    again.setDeviceMuted(true);
    vi.resetModules();
    const third = await import('./audio-mixer');
    expect((third.getMixer()!.master as unknown as FakeGain).gain.value).toBe(0);
  });
});
