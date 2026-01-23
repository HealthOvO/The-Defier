# Implement Card Upgrade Module

I will implement the missing card upgrade functionality to ensure the game works as intended.

## 1. Core Logic (`js/core/player.js`)
- Add `upgradeCard(cardInstanceId)` method to the `Player` class.
- Implement upgrade logic:
  - **Attack Cards**: Increase damage by ~30-50%.
  - **Defense Cards**: Increase block by ~30-50%.
  - **Buff/Debuff**: Increase duration or intensity.
  - **Visuals**: Add a "+" suffix to the name and a green border/text style.

## 2. UI Implementation (`index.html` & `css/style.css`)
- Add a reusable `card-selection-modal` to `index.html` for selecting cards from the deck.
- Add CSS styles for:
  - Upgraded cards (green title/border).
  - The selection modal layout.

## 3. Game Integration (`js/game.js` & `js/core/events.js`)
- Implement `showCardSelection(mode, callback)` in `Game` class.
- Update `js/core/events.js` to replace the `TODO` in `upgradeCard` event:
  - Open the selection screen.
  - On selection, call `player.upgradeCard()`.
  - Show a confirmation message.

## 4. Verification
- I will simulate an upgrade event to verify the flow.
- I will check if the card stats are correctly updated in the deck.

## 5. Start Instructions
- I will provide the command to open `index.html` in a browser to test the game.
