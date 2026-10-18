/** Headless Web-approval fixture: the only host service this scenario stubs.
 *
 * `@deepseek-ai/dsh-client-connection` started declaring `inject = ['credentials']`
 * in 0.2.1-rc.2 (it persists the browser-cookie signing secret through the
 * credential provider). The headless bundle ships no credential provider, so a
 * profile that inserts Connection alone stays pending forever and the whole
 * scenario dies on its 90 s budget. Only persistence is replaced here; the real
 * token exchange, signed cookies, and HTTP approval route stay untouched, which
 * mirrors what `scripts/web-routes-verify.mjs` already does in-process.
 */
export const name = 'runtime-lab-credentials';

export const inject = [];

export function apply(ctx) {
    let record;
    ctx.provide('credentials', {
        async modifyRecord(_key, update) {
            record = (await update(record)) ?? record;
            return record;
        },
    });
}
