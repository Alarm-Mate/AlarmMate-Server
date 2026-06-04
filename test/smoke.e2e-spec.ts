import { Harness, createHarness, resetDb, closeHarness } from './harness';
import { ApiBody, AuthTokens, expectSuccess, request, server } from './http';

describe('smoke', () => {
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

  it('registers a user and wraps the success response', async () => {
    const res = await request(server(h.app))
      .post('/auth/register')
      .send({
        email: 'smoke@example.com',
        nickname: 'smoke',
        password: 'password123',
      });
    expect(res.status).toBe(201);
    const body = res.body as ApiBody<AuthTokens>;
    expect(body.success).toBe(true);
    const data = expectSuccess(body);
    expect(typeof data.accessToken).toBe('string');
    expect(data.user.email).toBe('smoke@example.com');
  });
});
