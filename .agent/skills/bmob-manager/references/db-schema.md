# Database Schema

## Table: _User (System)
- `objectId`: String (Auto)
- `username`: String (Unique)
- `password`: String (Encrypted)

## Table: GameSave
- `user`: Pointer<_User> (Required)
- `slotIndex`: Number (0-3, denoting save slot)
- `saveData`: Object (Full JSON dump of player state)
- `saveTime`: Number (Timestamp)