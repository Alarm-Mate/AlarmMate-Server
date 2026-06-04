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

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

describe('auth', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await closeHarness(h);
  });
  beforeEach(async () => {
    await resetDb(h.prisma);
  });

  it('register: success returns tokens and user', async () => {
    const res = await request(server(h.app))
      .post('/auth/register')
      .send({ email: 'a@b.com', nickname: 'alice', password: 'password123' });
    expect(res.status).toBe(201);
    const data = expectSuccess(res.body as ApiBody<AuthTokens>);
    expect(data.user.nickname).toBe('alice');
    expect(typeof data.refreshToken).toBe('string');
  });

  it('register: duplicate email -> EMAIL_ALREADY_EXISTS 409', async () => {
    await registerUser(h.app, 'dup@b.com', 'one');
    const res = await request(server(h.app))
      .post('/auth/register')
      .send({ email: 'dup@b.com', nickname: 'two', password: 'password123' });
    expect(res.status).toBe(409);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'EMAIL_ALREADY_EXISTS',
    );
  });

  it('register: duplicate nickname -> NICKNAME_ALREADY_EXISTS 409', async () => {
    await registerUser(h.app, 'x@b.com', 'sameNick');
    const res = await request(server(h.app))
      .post('/auth/register')
      .send({ email: 'y@b.com', nickname: 'sameNick', password: 'password123' });
    expect(res.status).toBe(409);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'NICKNAME_ALREADY_EXISTS',
    );
  });

  it('register: weak password (too short) -> validation 400', async () => {
    const res = await request(server(h.app))
      .post('/auth/register')
      .send({ email: 'w@b.com', nickname: 'weak', password: 'short1' });
    expect(res.status).toBe(400);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('register: password without digit -> INVALID_PASSWORD_FORMAT 400', async () => {
    const res = await request(server(h.app))
      .post('/auth/register')
      .send({ email: 'w2@b.com', nickname: 'weak2', password: 'onlyletters' });
    expect(res.status).toBe(400);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'INVALID_PASSWORD_FORMAT',
    );
  });

  it('login: success', async () => {
    await registerUser(h.app, 'login@b.com', 'loginu');
    const res = await request(server(h.app))
      .post('/auth/login')
      .send({ email: 'login@b.com', password: 'password123' });
    expect(res.status).toBe(200);
    const data = expectSuccess(res.body as ApiBody<AuthTokens>);
    expect(data.user.email).toBe('login@b.com');
  });

  it('login: wrong password -> INVALID_CREDENTIALS 401', async () => {
    await registerUser(h.app, 'login2@b.com', 'loginu2');
    const res = await request(server(h.app))
      .post('/auth/login')
      .send({ email: 'login2@b.com', password: 'wrongpass123' });
    expect(res.status).toBe(401);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'INVALID_CREDENTIALS',
    );
  });

  it('refresh: rotation invalidates old token', async () => {
    const tokens = await registerUser(h.app, 'r@b.com', 'refresher');
    const res = await request(server(h.app))
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken });
    expect(res.status).toBe(200);
    const next = expectSuccess(res.body as ApiBody<TokenPair>);
    expect(next.refreshToken).not.toBe(tokens.refreshToken);

    const reuse = await request(server(h.app))
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken });
    expect(reuse.status).toBe(401);
    expect(expectError(reuse.body as ApiBody<unknown>).code).toBe(
      'INVALID_REFRESH_TOKEN',
    );

    const valid = await request(server(h.app))
      .post('/auth/refresh')
      .send({ refreshToken: next.refreshToken });
    expect(valid.status).toBe(200);
  });

  it('refresh: invalid token -> INVALID_REFRESH_TOKEN 401', async () => {
    const res = await request(server(h.app))
      .post('/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' });
    expect(res.status).toBe(401);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'INVALID_REFRESH_TOKEN',
    );
  });

  it('logout: invalidates refresh token', async () => {
    const tokens = await registerUser(h.app, 'lo@b.com', 'logoutu');
    const res = await request(server(h.app))
      .post('/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ refreshToken: tokens.refreshToken });
    expect(res.status).toBe(200);

    const reuse = await request(server(h.app))
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken });
    expect(reuse.status).toBe(401);
  });

  it('withdraw: cascades user data', async () => {
    const tokens = await registerUser(h.app, 'wd@b.com', 'withdrawu');
    const created = await h.prisma.alarm.create({
      data: {
        userId: tokens.user.id,
        name: 'a',
        time: '07:00',
        days: [1, 2],
      },
    });
    const res = await request(server(h.app))
      .delete('/auth/withdraw')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(res.status).toBe(200);

    const user = await h.prisma.user.findUnique({
      where: { id: tokens.user.id },
    });
    expect(user).toBeNull();
    const alarm = await h.prisma.alarm.findUnique({
      where: { id: created.id },
    });
    expect(alarm).toBeNull();
  });

  it('protected route without token -> 401 UNAUTHORIZED', async () => {
    const res = await request(server(h.app)).get('/users/me');
    expect(res.status).toBe(401);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe('UNAUTHORIZED');
  });

  it('protected route with invalid token -> 401', async () => {
    const res = await request(server(h.app))
      .get('/users/me')
      .set('Authorization', 'Bearer garbage.token.here');
    expect(res.status).toBe(401);
  });

  it('public route works without token', async () => {
    const res = await request(server(h.app))
      .post('/auth/login')
      .send({ email: 'nobody@b.com', password: 'password123' });
    expect(res.status).toBe(401);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'INVALID_CREDENTIALS',
    );
  });
});
