import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Server } from 'http';

export interface SuccessBody<T> {
  success: true;
  data: T;
}

export interface ErrorBody {
  success: false;
  error: { code: string; message: string };
}

export type ApiBody<T> = SuccessBody<T> | ErrorBody;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; nickname: string };
}

function server(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

export function isSuccess<T>(body: ApiBody<T>): body is SuccessBody<T> {
  return body.success === true;
}

export function expectSuccess<T>(body: ApiBody<T>): T {
  if (!isSuccess(body)) {
    throw new Error(
      `Expected success but got error: ${JSON.stringify(body.error)}`,
    );
  }
  return body.data;
}

export function expectError(body: ApiBody<unknown>): ErrorBody['error'] {
  if (body.success !== false) {
    throw new Error(`Expected error but got success: ${JSON.stringify(body)}`);
  }
  return body.error;
}

export async function registerUser(
  app: INestApplication,
  email: string,
  nickname: string,
  password = 'password123',
): Promise<AuthTokens> {
  const res = await request(server(app))
    .post('/auth/register')
    .send({ email, nickname, password });
  const body = res.body as ApiBody<AuthTokens>;
  return expectSuccess(body);
}

export function auth(token: string): string {
  return `Bearer ${token}`;
}

export { request, server };
