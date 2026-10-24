# Whatsapp

Source repository for **Whatsapp**.

## Structure

- `app` — application code.
- `client` — frontend.
- `server` — backend.
- `python` — Python tools.

## Available npm scripts

- `npm run dev`: `concurrently -n client,server -c "bgBlue.bold,bgMagenta.bold" "npm run dev --prefix client" "npm run dev --prefix server"`
