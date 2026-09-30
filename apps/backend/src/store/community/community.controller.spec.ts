import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../../auth/auth.guard';
import type { AuthProvider } from '../../auth/auth-provider';
import type { UsersService } from '../../users/users.service';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';

describe('community host access', () => {
  let app: INestApplication;
  const store = {
    list: jest.fn().mockResolvedValue({ enabled: true, entries: [], unavailable: [] }),
    preview: jest.fn().mockResolvedValue({ title: 'Quiz' }),
    readMedia: jest.fn().mockResolvedValue({ bytes: Buffer.from('image'), mime: 'image/png' }),
    take: jest.fn().mockResolvedValue({ id: 'draft' }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CommunityController],
      providers: [{ provide: CommunityService, useValue: store }],
    }).compile();
    app = module.createNestApplication();
    const provider: AuthProvider = {
      authenticate: async (req) => {
        const role = req.headers['x-test-role'];
        return typeof role === 'string'
          ? { sub: role, displayName: role, email: null, roles: [role] }
          : null;
      },
    };
    const users = {
      upsertFromPrincipal: async (p: { roles: string[] }) => ({ id: 'user', roles: p.roles }),
    };
    app.useGlobalGuards(new AuthGuard(provider, users as unknown as UsersService, new Reflector()));
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    Object.values(store).forEach((fn) => fn.mockClear());
  });
  it.each([
    ['', 401],
    ['player', 403],
    ['admin', 403],
    ['host', 200],
  ])('%s receives %s on listing, preview and preview media', async (role, status) => {
    for (const path of [
      '/community-store',
      '/community-store/key',
      '/community-store/key/media/image.png',
    ]) {
      const call = request(app.getHttpServer()).get(path);
      if (role) call.set('X-Test-Role', role);
      await call.expect(status);
    }
    expect(store.list).toHaveBeenCalledTimes(role === 'host' ? 1 : 0);
    expect(store.preview).toHaveBeenCalledTimes(role === 'host' ? 1 : 0);
    expect(store.readMedia).toHaveBeenCalledTimes(role === 'host' ? 1 : 0);
  });
  it('keeps taking a copy host-only too', async () => {
    await request(app.getHttpServer())
      .post('/community-store/take')
      .set('X-Test-Role', 'player')
      .send({ key: 'key' })
      .expect(403);
    expect(store.take).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/community-store/take')
      .set('X-Test-Role', 'host')
      .send({ key: 'key' })
      .expect(201);
    expect(store.take).toHaveBeenCalledWith('user', 'key');
  });
});
