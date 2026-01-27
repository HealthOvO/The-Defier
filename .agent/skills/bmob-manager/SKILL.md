---
name: bmob-manager
description: Expert in Bmob SDK v3. Handles database queries, cloud save synchronization (Slots), and user auth.
---

# Bmob Manager

## Goal
To safely manage cloud data, focusing on the Multi-Slot Save System.

## 💾 Save System Mechanics
We use a **4-Slot System** (Index 0-3).
- **Logic Reference**: `js/services/authService.js`
- **Querying**:
  - Always query `GameSave` table.
  - Condition: `user` (Pointer) == CurrentUser AND `slotIndex` == Target.
- **Saving**:
  - **Check First**: Query existence of the slot.
  - **Update**: If exists, `query.set('id', objectId)` then `save()`.
  - **Create**: If not exists, `query.save()`.

## ⚠️ Security & Syntax
- **Async/Await**: All Bmob operations are async.
- **Pointer Wrapper**: When saving a user relation, use `Bmob.Pointer('_User', userId)`.
- **Data Cleaning**: Before upload, use `JSON.parse(JSON.stringify(data))` to strip circular references (like `game.player.game`).

## 📋 Table Schema Reference
(See `references/db-schema.md` for full fields)
- **_User**: `username`, `password`, `mobilePhoneNumber`
- **GameSave**: `user` (Pointer), `slotIndex` (Number), `saveData` (Object), `saveTime` (Number)