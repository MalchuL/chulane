# Build the POC with pnpm first. The final service needs Node and the two built outputs.
FROM node:24-bookworm-slim
WORKDIR /opt/chulane
COPY dist-host/web-runtime/node_modules node_modules
COPY dist dist
COPY dist-host/web/main.mjs dist-host/web/main.mjs
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=4173 CHULANE_DATA=/data
EXPOSE 4173
VOLUME /data
CMD ["node", "dist-host/web/main.mjs"]
