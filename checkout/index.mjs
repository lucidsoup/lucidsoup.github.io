/* The Workers entry point, and deliberately almost nothing: everything that
   can be tested lives in worker.mjs, which knows nothing about Cloudflare. */
import { handle } from './worker.mjs';
import { kvStore } from './store.mjs';

export default {
    fetch(request, env, ctx) {
        return handle(request, env, { store: kvStore(env.ORDERS) });
    },
};
