FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8000 HOST=0.0.0.0
WORKDIR /app
COPY --chown=node:node serve.js privatePortal.js feedbackStore.js decisionStore.js accueil.html index.html editor.html portal.html ./
COPY --chown=node:node js/ ./js/
COPY --chown=node:node css/ ./css/
COPY --chown=node:node assets/fonts/ ./assets/fonts/
COPY --chown=node:node assets/vendor/ ./assets/vendor/
COPY --chown=node:node deploy/staging/data.js ./js/data.js
COPY --chown=node:node deploy/staging/projects/ ./projects/
RUN mkdir -p /app/.private-portal && chown node:node /app/.private-portal
USER node
VOLUME ["/app/.private-portal", "/app/projects"]
CMD ["node", "serve.js"]
