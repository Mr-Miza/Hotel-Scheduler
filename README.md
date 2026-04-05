# 🏨 Hotel Scheduler

A secure, mobile-friendly hotel room scheduling app. Runs locally, all data stored in a SQLite file.

## Setup

```bash
cd hotel-scheduler
npm install
node server.js
```

Then open: **http://localhost:3000**

## Features

- 📊 **Dashboard** — Occupancy stats, today's check-ins/check-outs, upcoming arrivals
- 📅 **Calendar** — Timeline view (Google Calendar-style) + Month view
  - Click any empty cell to book that room/date
  - Click any booking to edit it
- 📋 **Bookings** — Full list with search, edit, delete
- 🚪 **Rooms** — Visual room grid by floor, add/remove rooms
- ✅ **Availability** — Check which rooms are free for any date range, book directly

## Default Rooms

- **Floor 1:** 103, 104
- **Floor 2:** 201–211
- **Floor 3:** 301–311

## Data

All data is stored in `db/hotel.db` (SQLite file). Back it up by copying that file.

## Mobile

Fully responsive — works great on phones and tablets.
