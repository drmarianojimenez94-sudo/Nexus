import { createApp } from "./app.js";
import { env } from "./lib/env.js";

import { reconcileClinicalIndexes } from "./lib/clinicalIndexes.js";
await reconcileClinicalIndexes();
const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`NEXUS API listening on :${env.port}`);
});
