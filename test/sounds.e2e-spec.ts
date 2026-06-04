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

interface SoundView {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
  userId: string | null;
}

interface AudioPresignResult {
  presignedUrl: string;
  fileUrl: string;
  key: string;
}

async function seedDefaultSound(
  h: Harness,
  name: string,
): Promise<string> {
  const sound = await h.prisma.sound.create({
    data: {
      name,
      url: `https://cdn.alarmmate.app/${name}.mp3`,
      isDefault: true,
    },
  });
  return sound.id;
}

describe('sounds', () => {
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

  it('list: returns defaults plus caller custom sounds, not others custom', async () => {
    await seedDefaultSound(h, 'default-1');
    await request(server(h.app))
      .post('/sounds')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'My Sound', url: 'https://s3/alice.mp3' });
    await request(server(h.app))
      .post('/sounds')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ name: 'Bob Sound', url: 'https://s3/bob.mp3' });

    const res = await request(server(h.app))
      .get('/sounds')
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(200);
    const sounds = expectSuccess(res.body as ApiBody<SoundView[]>);
    const names = sounds.map((s) => s.name);
    expect(names).toContain('default-1');
    expect(names).toContain('My Sound');
    expect(names).not.toContain('Bob Sound');
  });

  it('create: registers a custom sound owned by caller', async () => {
    const res = await request(server(h.app))
      .post('/sounds')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'My Sound', url: 'https://s3/alice.mp3' });
    expect(res.status).toBe(201);
    const sound = expectSuccess(res.body as ApiBody<SoundView>);
    expect(sound.isDefault).toBe(false);
    expect(sound.userId).toBe(alice.user.id);
    expect(sound.name).toBe('My Sound');
  });

  it('delete: caller can delete own custom sound', async () => {
    const created = await request(server(h.app))
      .post('/sounds')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'My Sound', url: 'https://s3/alice.mp3' });
    const sound = expectSuccess(created.body as ApiBody<SoundView>);

    const res = await request(server(h.app))
      .delete(`/sounds/${sound.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(200);

    const remaining = await h.prisma.sound.findUnique({
      where: { id: sound.id },
    });
    expect(remaining).toBeNull();
  });

  it('delete: cannot delete a default sound -> SOUND_NOT_FOUND 404', async () => {
    const defaultId = await seedDefaultSound(h, 'default-1');
    const res = await request(server(h.app))
      .delete(`/sounds/${defaultId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(404);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'SOUND_NOT_FOUND',
    );
  });

  it('delete: cannot delete another users sound -> SOUND_NOT_FOUND 404', async () => {
    const created = await request(server(h.app))
      .post('/sounds')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ name: 'Bob Sound', url: 'https://s3/bob.mp3' });
    const sound = expectSuccess(created.body as ApiBody<SoundView>);

    const res = await request(server(h.app))
      .delete(`/sounds/${sound.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(404);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'SOUND_NOT_FOUND',
    );
  });

  it('audio presign: accepts audio mime and returns a presigned url', async () => {
    const res = await request(server(h.app))
      .post('/uploads/audio-presigned-url')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ contentType: 'audio/mpeg', fileSize: 1024 });
    expect(res.status).toBe(200);
    const data = expectSuccess(res.body as ApiBody<AudioPresignResult>);
    expect(typeof data.presignedUrl).toBe('string');
    expect(data.key.startsWith('sounds/')).toBe(true);
    expect(data.fileUrl.length).toBeGreaterThan(0);
  });

  it('audio presign: rejects non-audio mime -> VALIDATION_ERROR 400', async () => {
    const res = await request(server(h.app))
      .post('/uploads/audio-presigned-url')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ contentType: 'image/png', fileSize: 1024 });
    expect(res.status).toBe(400);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('audio presign: rejects oversized file -> VALIDATION_ERROR 400', async () => {
    const res = await request(server(h.app))
      .post('/uploads/audio-presigned-url')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ contentType: 'audio/wav', fileSize: 11 * 1024 * 1024 });
    expect(res.status).toBe(400);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'VALIDATION_ERROR',
    );
  });
});
