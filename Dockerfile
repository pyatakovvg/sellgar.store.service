FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS builder
WORKDIR /app
COPY code/ ./
RUN node .yarn/releases/yarn-4.18.0.cjs install --immutable \
    && node .yarn/releases/yarn-4.18.0.cjs build

FROM postgres:16.16-bookworm@sha256:ce3efec6bc404f6b15ebf5d9bed6b45a9d4655aea238d7dacc3467ccb05a1175 AS verifier
COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=builder --chown=postgres:postgres /app /app
WORKDIR /app
ENV PATH="/usr/lib/postgresql/16/bin:${PATH}" \
    DATABASE_HOST=127.0.0.1 DATABASE_PORT=55432 DATABASE_USERNAME=postgres \
    DATABASE_PASSWORD=smoke DATABASE_DATABASE_NAME=store_test
USER postgres
RUN set -eu; \
    initdb -D /tmp/store-test-db -A trust --locale=C.UTF-8 --encoding=UTF8 > /tmp/initdb.log; \
    pg_ctl -D /tmp/store-test-db -l /tmp/postgres.log -o '-h 127.0.0.1 -p 55432' -w start; \
    trap 'pg_ctl -D /tmp/store-test-db -m immediate -w stop' EXIT; \
    createdb -h 127.0.0.1 -p 55432 -U postgres store_test; \
    node .yarn/releases/yarn-4.18.0.cjs test --runInBand; \
    node .yarn/releases/yarn-4.18.0.cjs test:integration; \
    touch /tmp/store-tests-passed

FROM builder AS production-dependencies
COPY --from=verifier /tmp/store-tests-passed /tmp/store-tests-passed
RUN node .yarn/releases/yarn-4.18.0.cjs workspaces focus --production

FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS server
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/library/sellgar.outbox.library/package.json ./library/sellgar.outbox.library/package.json
COPY --from=builder --chown=node:node /app/library/sellgar.outbox.library/dist ./library/sellgar.outbox.library/dist
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 8080
CMD ["node", "--env-file=.env", "dist/main.js"]
