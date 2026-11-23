# Build the service, UI and portable backup utility with pnpm first.
FROM node:24-bookworm-slim
WORKDIR /opt/chulane
COPY dist-host/web-runtime/node_modules node_modules
COPY dist-host/backup.mjs dist-host/backup.mjs
# Keep the CLI path used by existing deployment and recovery scripts.
RUN mkdir -p src/tools && ln -s ../../dist-host/backup.mjs src/tools/backup.ts
COPY dist dist
COPY dist-host/web/main.mjs dist-host/web/main.mjs
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=4173 CHULANE_DATA=/data
EXPOSE 4173
VOLUME /data
CMD ["node", "dist-host/web/main.mjs"]
