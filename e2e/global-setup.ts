import { buildApp } from './build-app.mjs';

export default async function globalSetup() {
  await buildApp();
}
