FROM denoland/deno:alpine

WORKDIR /app

COPY . .

RUN deno cache serve.js

EXPOSE 8000

CMD ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "serve.js"]
