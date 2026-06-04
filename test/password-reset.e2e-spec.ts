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

interface ForgotResult {
  requested: boolean;
}

interface ResetResult {
  reset: boolean;
}

describe('password reset', () => {
  let h: Harness;
  let alice: AuthTokens;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await closeHarness(h);
  });
  beforeEach(async () => {
    await resetDb(h.prisma);
    alice = await registerUser(h.app, 'alice@b.com', 'alice', 'password123');
  });

  it('forgot-password: existing email creates a reset token and returns generic success', async () => {
    const res = await request(server(h.app))
      .post('/auth/forgot-password')
      .send({ email: 'alice@b.com' });
    expect(res.status).toBe(200);
    const data = expectSuccess(res.body as ApiBody<ForgotResult>);
    expect(data.requested).toBe(true);

    const tokens = await h.prisma.passwordResetToken.findMany({
      where: { userId: alice.user.id },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].used).toBe(false);
    const ttlMs = tokens[0].expiresAt.getTime() - tokens[0].createdAt.getTime();
    expect(Math.round(ttlMs / (60 * 1000))).toBe(10);
    expect(tokens[0].token).toMatch(/^\d{6}$/);
  });

  it('forgot-password: unknown email returns generic success and creates no token', async () => {
    const res = await request(server(h.app))
      .post('/auth/forgot-password')
      .send({ email: 'nobody@b.com' });
    expect(res.status).toBe(200);
    const data = expectSuccess(res.body as ApiBody<ForgotResult>);
    expect(data.requested).toBe(true);

    const count = await h.prisma.passwordResetToken.count();
    expect(count).toBe(0);
  });

  it('reset-password: valid token updates password, marks used, removes refresh tokens', async () => {
    await request(server(h.app))
      .post('/auth/forgot-password')
      .send({ email: 'alice@b.com' });
    const record = await h.prisma.passwordResetToken.findFirst({
      where: { userId: alice.user.id },
    });
    expect(record).not.toBeNull();

    const res = await request(server(h.app))
      .post('/auth/reset-password')
      .send({ email: 'alice@b.com', code: record!.token, newPassword: 'newpass123' });
    expect(res.status).toBe(200);
    const data = expectSuccess(res.body as ApiBody<ResetResult>);
    expect(data.reset).toBe(true);

    const updated = await h.prisma.passwordResetToken.findUnique({
      where: { id: record!.id },
    });
    expect(updated!.used).toBe(true);

    const refreshTokens = await h.prisma.refreshToken.findMany({
      where: { userId: alice.user.id },
    });
    expect(refreshTokens).toHaveLength(0);

    const loginNew = await request(server(h.app))
      .post('/auth/login')
      .send({ email: 'alice@b.com', password: 'newpass123' });
    expect(loginNew.status).toBe(200);

    const loginOld = await request(server(h.app))
      .post('/auth/login')
      .send({ email: 'alice@b.com', password: 'password123' });
    expect(loginOld.status).toBe(401);
  });

  it('reset-password: invalid token -> INVALID_RESET_TOKEN 401', async () => {
    const res = await request(server(h.app))
      .post('/auth/reset-password')
      .send({ email: 'alice@b.com', code: '000000', newPassword: 'newpass123' });
    expect(res.status).toBe(401);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'INVALID_RESET_TOKEN',
    );
  });

  it('reset-password: used token -> INVALID_RESET_TOKEN 401', async () => {
    await request(server(h.app))
      .post('/auth/forgot-password')
      .send({ email: 'alice@b.com' });
    const record = await h.prisma.passwordResetToken.findFirst({
      where: { userId: alice.user.id },
    });
    await request(server(h.app))
      .post('/auth/reset-password')
      .send({ email: 'alice@b.com', code: record!.token, newPassword: 'newpass123' });

    const res = await request(server(h.app))
      .post('/auth/reset-password')
      .send({ email: 'alice@b.com', code: record!.token, newPassword: 'another123' });
    expect(res.status).toBe(401);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'INVALID_RESET_TOKEN',
    );
  });

  it('reset-password: expired token -> INVALID_RESET_TOKEN 401', async () => {
    await request(server(h.app))
      .post('/auth/forgot-password')
      .send({ email: 'alice@b.com' });
    const record = await h.prisma.passwordResetToken.findFirst({
      where: { userId: alice.user.id },
    });
    await h.prisma.passwordResetToken.update({
      where: { id: record!.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(server(h.app))
      .post('/auth/reset-password')
      .send({ email: 'alice@b.com', code: record!.token, newPassword: 'newpass123' });
    expect(res.status).toBe(401);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'INVALID_RESET_TOKEN',
    );
  });

  it('reset-password: weak password -> INVALID_PASSWORD_FORMAT 400', async () => {
    await request(server(h.app))
      .post('/auth/forgot-password')
      .send({ email: 'alice@b.com' });
    const record = await h.prisma.passwordResetToken.findFirst({
      where: { userId: alice.user.id },
    });

    const res = await request(server(h.app))
      .post('/auth/reset-password')
      .send({ email: 'alice@b.com', code: record!.token, newPassword: 'alllettersnodigits' });
    expect(res.status).toBe(400);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'INVALID_PASSWORD_FORMAT',
    );
  });
});
