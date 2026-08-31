import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readProjectFile = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

test('container and Render templates keep a healthy non-root Node 22 service contract', async () => {
  const [dockerfile, dockerignore, renderTemplate] = await Promise.all([
    readProjectFile('Dockerfile'),
    readProjectFile('.dockerignore'),
    readProjectFile('render.yaml'),
  ]);

  assert.match(dockerfile, /^FROM node:22(?:-|\s)/m);
  assert.match(dockerfile, /^USER node$/m);
  assert.match(dockerfile, /^EXPOSE 2567$/m);
  assert.match(dockerfile, /^CMD \["npm", "start"\]$/m);
  assert.match(dockerfile, /^HEALTHCHECK .*fetch\('http:\/\/127\.0\.0\.1:'/m);
  assert.doesNotMatch(dockerfile, /curl/i);

  assert.match(dockerignore, /^\.git$/m);
  assert.match(dockerignore, /^\.worktrees$/m);
  assert.match(dockerignore, /^node_modules$/m);
  assert.match(dockerignore, /^\.env$/m);
  assert.doesNotMatch(dockerignore, /^vendor$/m);
  assert.doesNotMatch(dockerignore, /^LICENSE$/m);

  assert.match(renderTemplate, /^services:$/m);
  assert.match(renderTemplate, /^\s+- type: web$/m);
  assert.match(renderTemplate, /^\s+runtime: docker$/m);
  assert.match(renderTemplate, /^\s+plan: free$/m);
  assert.match(renderTemplate, /^\s+healthCheckPath: \/health$/m);
  assert.doesNotMatch(renderTemplate, /envVars:|databases:/);
});
