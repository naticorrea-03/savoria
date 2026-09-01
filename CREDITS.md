# Credits

## Savoria

Original Savoria code, images, and synthesized audio are credited to Natalia Correa. See [LICENSE](./LICENSE) and [ASSET-LICENSE.md](./ASSET-LICENSE.md).

## Three.js

[`vendor/three.module.js`](./vendor/three.module.js) is vendored from Three.js revision 166. Its source header retains this notice:

```text
Copyright 2010-2024 Three.js Authors
SPDX-License-Identifier: MIT
```

Three.js remains available under the MIT License. Its notice stays with the vendored file.

## Online Co-op and test dependencies

The package lock records exact dependency artifacts. These direct dependencies support the combined co-op server, browser protocol client, and test suite:

| Package | Version | Upstream | License |
| --- | --- | --- | --- |
| `@colyseus/core` | `0.18.10` | [Colyseus](https://github.com/colyseus/colyseus) | MIT |
| `@colyseus/ws-transport` | `0.18.2` | [Colyseus](https://github.com/colyseus/colyseus) | MIT |
| `@colyseus/sdk` | `0.18.2` | [Colyseus](https://github.com/colyseus/colyseus) | MIT |
| `@colyseus/schema` | `5.0.25` | [Colyseus Schema](https://github.com/colyseus/schema) | MIT |
| `@colyseus/testing` | `0.18.5` | [Colyseus](https://github.com/colyseus/colyseus) | MIT |
| `@colyseus/tools` | `0.18.3` | [Colyseus](https://github.com/colyseus/colyseus) | MIT |
| `@colyseus/loadtest` | `0.18.2` | [Colyseus](https://github.com/colyseus/colyseus) | MIT |
| `express` | `5.2.1` | [Express](https://github.com/expressjs/express) | MIT |
| `@playwright/test` | `1.62.1` | [Playwright](https://github.com/microsoft/playwright) | Apache-2.0 |

`vendor/colyseus.js` is the browser SDK bundle. Its upstream license is retained at [`vendor/COLYSEUS-SDK-LICENSE.txt`](./vendor/COLYSEUS-SDK-LICENSE.txt). Keep that file when updating or redistributing the bundle. Package licenses for installed dependencies remain in their respective package distributions.

The checked-in browser bundle is the exact `@colyseus/sdk` 0.18.2 artifact. Its source header bundles Schema 5.0.8. The server directly depends on `@colyseus/schema` 5.0.25. Those are separate upstream artifacts, so do not regenerate or edit `vendor/colyseus.js` to make their header versions match.
