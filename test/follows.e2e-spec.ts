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

interface FollowList {
  items: Array<{ id: string; nickname: string; isFollowing: boolean }>;
  nextCursor: string | null;
  hasMore: boolean;
}

describe('follows', () => {
  let h: Harness;
  let alice: AuthTokens;
  let bob: AuthTokens;
  let carol: AuthTokens;

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
    carol = await registerUser(h.app, 'carol@b.com', 'carol');
  });

  it('follow: self -> CANNOT_FOLLOW_SELF 400', async () => {
    const res = await request(server(h.app))
      .post(`/follows/${alice.user.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(400);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'CANNOT_FOLLOW_SELF',
    );
  });

  it('follow: success then duplicate -> ALREADY_FOLLOWING 409', async () => {
    const ok = await request(server(h.app))
      .post(`/follows/${bob.user.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(ok.status).toBe(201);
    const dup = await request(server(h.app))
      .post(`/follows/${bob.user.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(dup.status).toBe(409);
    expect(expectError(dup.body as ApiBody<unknown>).code).toBe(
      'ALREADY_FOLLOWING',
    );
  });

  it('follow creates NEW_FOLLOWER notification for target', async () => {
    await request(server(h.app))
      .post(`/follows/${bob.user.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    const notifs = await h.prisma.notification.findMany({
      where: { userId: bob.user.id, type: 'NEW_FOLLOWER' },
    });
    expect(notifs).toHaveLength(1);
  });

  it('unfollow removes the relation', async () => {
    await request(server(h.app))
      .post(`/follows/${bob.user.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    const res = await request(server(h.app))
      .delete(`/follows/${bob.user.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(200);
    const rel = await h.prisma.follow.findFirst({
      where: { followerId: alice.user.id, followingId: bob.user.id },
    });
    expect(rel).toBeNull();
  });

  it('followers/following lists with correct isFollowing flags', async () => {
    await h.prisma.follow.create({
      data: { followerId: bob.user.id, followingId: alice.user.id },
    });
    await h.prisma.follow.create({
      data: { followerId: carol.user.id, followingId: alice.user.id },
    });
    await h.prisma.follow.create({
      data: { followerId: alice.user.id, followingId: bob.user.id },
    });

    const followersRes = await request(server(h.app))
      .get(`/users/${alice.user.id}/followers`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    const followers = expectSuccess(followersRes.body as ApiBody<FollowList>);
    expect(followers.items).toHaveLength(2);
    const bobEntry = followers.items.find((u) => u.id === bob.user.id);
    const carolEntry = followers.items.find((u) => u.id === carol.user.id);
    expect(bobEntry?.isFollowing).toBe(true);
    expect(carolEntry?.isFollowing).toBe(false);

    const followingRes = await request(server(h.app))
      .get(`/users/${alice.user.id}/following`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    const following = expectSuccess(followingRes.body as ApiBody<FollowList>);
    expect(following.items).toHaveLength(1);
    expect(following.items[0].id).toBe(bob.user.id);
    expect(following.items[0].isFollowing).toBe(true);
  });

  it('followers cursor pagination nextCursor/hasMore correct (seed > page size)', async () => {
    const followers: AuthTokens[] = [];
    for (let i = 0; i < 5; i += 1) {
      const u = await registerUser(h.app, `f${i}@b.com`, `follower${i}`);
      followers.push(u);
      await h.prisma.follow.create({
        data: { followerId: u.user.id, followingId: alice.user.id },
      });
    }

    const firstRes = await request(server(h.app))
      .get(`/users/${alice.user.id}/followers`)
      .query({ limit: 2 })
      .set('Authorization', `Bearer ${alice.accessToken}`);
    const first = expectSuccess(firstRes.body as ApiBody<FollowList>);
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const seen = new Set<string>(first.items.map((i) => i.id));
    let cursor = first.nextCursor;
    let guard = 0;
    while (cursor && guard < 10) {
      const res = await request(server(h.app))
        .get(`/users/${alice.user.id}/followers`)
        .query({ limit: 2, cursor })
        .set('Authorization', `Bearer ${alice.accessToken}`);
      const page = expectSuccess(res.body as ApiBody<FollowList>);
      for (const item of page.items) {
        seen.add(item.id);
      }
      cursor = page.nextCursor;
      guard += 1;
    }
    expect(seen.size).toBe(5);
  });
});
