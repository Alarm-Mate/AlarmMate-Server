import { Harness, createHarness, resetDb, closeHarness } from './harness';
import {
  ApiBody,
  AuthTokens,
  expectError,
  expectSuccess,
  registerUser,
  request,
  server,
} from './http';

interface MeProfile {
  id: string;
  email: string;
  nickname: string;
  wakeStreak: number;
  totalWakeDays: number;
  followerCount: number;
  followingCount: number;
  oneSignalSubscriptionId: string | null;
}

interface SearchView {
  items: Array<{ id: string; nickname: string; isFollowing: boolean }>;
  nextCursor: string | null;
  hasMore: boolean;
}

interface GrassEntry {
  date: string;
  woke: boolean;
  wokeAt: string | null;
}

interface PublicProfile {
  id: string;
  nickname: string;
  isFollowing: boolean;
  grassData: GrassEntry[];
  followerCount: number;
}

describe('users', () => {
  let h: Harness;
  let alice: AuthTokens;
  let bob: AuthTokens;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await closeHarness(h);
  });
  beforeEach(async () => {
    await resetDb(h.prisma);
    alice = await registerUser(h.app, 'alice@b.com', 'alice');
    bob = await registerUser(h.app, 'bob@b.com', 'bob');
  });

  it('GET /users/me returns counts and streak', async () => {
    await h.prisma.user.update({
      where: { id: alice.user.id },
      data: { wakeStreak: 5, totalWakeDays: 12 },
    });
    await h.prisma.follow.create({
      data: { followerId: bob.user.id, followingId: alice.user.id },
    });
    await h.prisma.follow.create({
      data: { followerId: alice.user.id, followingId: bob.user.id },
    });
    const res = await request(server(h.app))
      .get('/users/me')
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(200);
    const me = expectSuccess(res.body as ApiBody<MeProfile>);
    expect(me.wakeStreak).toBe(5);
    expect(me.totalWakeDays).toBe(12);
    expect(me.followerCount).toBe(1);
    expect(me.followingCount).toBe(1);
  });

  it('PATCH /users/me updates nickname', async () => {
    const res = await request(server(h.app))
      .patch('/users/me')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ nickname: 'alice2', wakeGoalTime: '06:30' });
    expect(res.status).toBe(200);
    const me = expectSuccess(res.body as ApiBody<MeProfile>);
    expect(me.nickname).toBe('alice2');
  });

  it('PATCH /users/me nickname duplicate -> 409', async () => {
    const res = await request(server(h.app))
      .patch('/users/me')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ nickname: 'bob' });
    expect(res.status).toBe(409);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'NICKNAME_ALREADY_EXISTS',
    );
  });

  it('PATCH /users/me/onesignal upsert overwrites', async () => {
    await request(server(h.app))
      .patch('/users/me/onesignal')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ oneSignalSubscriptionId: 'sub-1' });
    const res = await request(server(h.app))
      .patch('/users/me/onesignal')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ oneSignalSubscriptionId: 'sub-2' });
    expect(res.status).toBe(200);
    const data = expectSuccess(
      res.body as ApiBody<{ oneSignalSubscriptionId: string }>,
    );
    expect(data.oneSignalSubscriptionId).toBe('sub-2');
    const fresh = await h.prisma.user.findUnique({
      where: { id: alice.user.id },
    });
    expect(fresh?.oneSignalSubscriptionId).toBe('sub-2');
  });

  it('GET /users/search with isFollowing flag and cursor', async () => {
    await h.prisma.follow.create({
      data: { followerId: alice.user.id, followingId: bob.user.id },
    });
    const res = await request(server(h.app))
      .get('/users/search')
      .query({ nickname: 'bob' })
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(200);
    const data = expectSuccess(res.body as ApiBody<SearchView>);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].nickname).toBe('bob');
    expect(data.items[0].isFollowing).toBe(true);
  });

  it('GET /users/search excludes self', async () => {
    const res = await request(server(h.app))
      .get('/users/search')
      .query({ nickname: 'alice' })
      .set('Authorization', `Bearer ${alice.accessToken}`);
    const data = expectSuccess(res.body as ApiBody<SearchView>);
    expect(data.items.find((u) => u.id === alice.user.id)).toBeUndefined();
  });

  it('GET /users/:userId returns isFollowing and 12-week (84-day) grass', async () => {
    await h.prisma.follow.create({
      data: { followerId: alice.user.id, followingId: bob.user.id },
    });
    const res = await request(server(h.app))
      .get(`/users/${bob.user.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(200);
    const profile = expectSuccess(res.body as ApiBody<PublicProfile>);
    expect(profile.isFollowing).toBe(true);
    expect(profile.grassData).toHaveLength(84);
  });

  it('GET /users/:userId not found -> 404', async () => {
    const res = await request(server(h.app))
      .get('/users/nonexistentid')
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(404);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'USER_NOT_FOUND',
    );
  });

  it('GET /users/:userId/grass default 12 weeks (84 days)', async () => {
    const res = await request(server(h.app))
      .get(`/users/${alice.user.id}/grass`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(200);
    const grass = expectSuccess(res.body as ApiBody<GrassEntry[]>);
    expect(grass).toHaveLength(84);
  });

  it('GET grass with weeks=52 -> 364 days', async () => {
    const res = await request(server(h.app))
      .get(`/users/${alice.user.id}/grass`)
      .query({ weeks: 52 })
      .set('Authorization', `Bearer ${alice.accessToken}`);
    const grass = expectSuccess(res.body as ApiBody<GrassEntry[]>);
    expect(grass).toHaveLength(364);
  });

  it('GET grass with weeks > 52 -> validation rejects (max 52)', async () => {
    const res = await request(server(h.app))
      .get(`/users/${alice.user.id}/grass`)
      .query({ weeks: 100 })
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(400);
  });
});
