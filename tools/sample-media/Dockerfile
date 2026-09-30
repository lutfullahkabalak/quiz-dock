# The sample quizzes' media, fetched from Wikimedia Commons and prepared like the
# editor would (see fetch.mjs). Only Docker is needed on the host: ./run.sh.
FROM node:24-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /work
COPY fetch.mjs /tools/fetch.mjs
ENTRYPOINT ["node", "/tools/fetch.mjs"]
