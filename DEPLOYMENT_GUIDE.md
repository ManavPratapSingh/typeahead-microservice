# Deployment Guide

This guide outlines how to deploy the Search Typeahead Microservice to the cloud and serve a public deployed link.

---

## 1. Managed PaaS Deployment (Recommended & Easiest)

Platforms like **Render**, **Railway**, or **Fly.io** are the fastest way to deploy this service and get a public HTTPS URL.

### Database Setup
For a cloud deployment, do not run PostgreSQL/Redis locally on your host. Use free hosted tiers:
1. **PostgreSQL:** Create a database instance on [Supabase](https://supabase.com) or [Neon](https://neon.tech).
2. **Redis:** Create a database instance on [Upstash](https://upstash.com) (free serverless Redis) or [Redis Labs](https://redis.com).

### Render Deployment Steps
1. Push this git repository to your GitHub account.
2. Sign in to [Render](https://render.com) and click **New > Web Service**.
3. Connect your GitHub repository.
4. Configure the Web Service settings:
   * **Runtime:** `Node`
   * **Build Command:** `npm install && npm run build && npm run db:init`
     *(This installs dependencies, builds the TypeScript code, and initializes the SQL schema)*
   * **Start Command:** `npm start`
5. Click **Advanced** and add the following Environment Variables:
   * `PORT`: `3000` (Render overrides this, but standardizes it)
   * `PG_HOST`: *(Your cloud PostgreSQL host)*
   * `PG_PORT`: `5432` *(Or your database's connection port)*
   * `PG_USER`: *(Your PostgreSQL username)*
   * `PG_PASSWORD`: *(Your PostgreSQL password)*
   * `PG_DATABASE`: *(Your PostgreSQL database name)*
   * `REDIS_URL`: *(Your cloud Redis connection string: `redis://default:password@host:port`)*
   * `SAMPLING_PER_QUERY_X`: `5`
   * `SAMPLING_GLOBAL_BATCH_G`: `20`
   * `DECAY_INTERVAL_SEC`: `120`
   * `DECAY_AMOUNT`: `2`
6. Click **Deploy Web Service**.
7. *(Optional)* Run the seed script once by using Render's interactive shell or running locally pointed to the remote database:
   ```bash
   # Run locally to seed the cloud PG db (ensure your IP is white-listed)
   npm run seed
   ```

---

## 2. VPS Deployment (DigitalOcean, AWS EC2, Linode)

If you have a Linux VPS, you can run the entire system using Docker Compose.

### Prerequisites
* Docker and Docker Compose installed on your host.
* Port 80/443 open.

### Deployment Steps
1. Clone the repository onto the server.
2. Create a production `.env` file containing the production credentials.
3. Start the containers in detached mode:
   ```bash
   docker-compose up -d --build
   ```
4. Initialize the PostgreSQL schema and seed the initial dataset:
   ```bash
   docker-compose exec -w /app typeahead-postgres npm run db:init
   docker-compose exec -w /app typeahead-postgres npm run seed
   ```
5. *(Optional)* Setup a reverse proxy like **Nginx** or **Caddy** to handle SSL termination and route requests from port `80/443` to the Express service running on port `3000`.

---

## Build & Run Commands Reference

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run build` | Compiles TypeScript source to production JavaScript in `/dist` |
| `npm run db:init` | Run SQL scripts to create table and indexing on the targeted DB |
| `npm run seed` | Seeds ~500 entries (titles + review counts) to PG |
| `npm start` | Launches Express server in production using `/dist/index.js` |
