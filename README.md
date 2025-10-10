<p align="center">
  <img src="public/logo.png" alt="MTG Deck Diff Logo" width="300" />
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