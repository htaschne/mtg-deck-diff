


<p align="center">
  <img src="public/logo.png" alt="MTG Deck Diff Logo" width="128" />
</p>

# MTG Deck Diff

A single-page web app to compare two Magic: The Gathering decks.

Paste or load two deck `.txt` files, and it will:
- Sort cards by name.
- Fetch card thumbnails and stats from Scryfall.
- Show color-coded differences:
  - 🟥 Red — only in Deck A
  - 🟩 Green — only in Deck B
  - 🟨 Yellow — different quantities
  - ⚫ Gray — same in both decks

### Tech stack
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Scryfall API](https://scryfall.com/docs/api)

### Development
```bash
npm install
npm run dev
```

### Build
```bash
npm run build
```

### Deploy
This project is ready to be deployed to GitHub Pages or any static host.
```bash
npm run deploy
```