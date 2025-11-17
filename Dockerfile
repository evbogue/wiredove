FROM denoland/deno:alpine

WORKDIR /app

COPY . .

EXPOSE 8000

CMD ["run", "--allow-net", "--allow-read", "serve.js"]
