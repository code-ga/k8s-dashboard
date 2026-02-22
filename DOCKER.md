# Docker Setup

This project includes Docker Compose configuration for running the entire application stack locally.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (version 20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (version 2.0+)

## Quick Start

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone <repository-url>
   cd k8s-dashboard
   ```

2. **Start the application**:
   ```bash
   docker-compose up -d
   ```

   This will:
   - Build the frontend and backend images
   - Start PostgreSQL database
   - Start the backend API server (port 3001)
   - Start the frontend application (port 3000)

3. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - API Docs: http://localhost:3001/doc (if enabled)

## Common Commands

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

### Stop the application
```bash
docker-compose down
```

### Stop and remove all data (including database)
```bash
docker-compose down -v
```

### Rebuild images
```bash
docker-compose build --no-cache
```

### Run migrations (if needed)
```bash
docker-compose exec backend bun run db:migrate
docker-compose exec backend bun run db:push
```

## Environment Variables

Default credentials are set in `docker-compose.yml`. For production, create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Then customize the values:

```env
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=your_database_name
DATABASE_URL=postgresql://your_user:your_secure_password@postgres:5432/your_database_name
```

## Service Details

### PostgreSQL (postgres)
- **Container**: postgres:16-alpine
- **Port**: 5432
- **Volume**: `postgres_data` (persistent)
- **Health Check**: Enabled

### Backend (backend)
- **Framework**: Elysia (Bun runtime)
- **Port**: 3001
- **Build**: Multi-stage Dockerfile for optimized size
- **Dependencies**: Waits for PostgreSQL to be healthy

### Frontend (frontend)
- **Framework**: React + Vite
- **Port**: 3000
- **Build**: Multi-stage build with http-server for static serving
- **Dependencies**: Waits for backend to be running

## Network

All services are connected via the `k8s-dashboard-network` bridge network, allowing services to communicate by service name (e.g., `postgres:5432` from backend).

## Development vs Production

This Docker setup is configured for production. For development:

1. Run services individually with docker-compose:
   ```bash
   docker-compose up postgres
   ```

2. Run frontend and backend locally:
   ```bash
   # Terminal 1 - Frontend
   cd frontend
   npm run dev

   # Terminal 2 - Backend
   cd backend
   npm run dev
   ```

## Troubleshooting

### Port Already in Use
If ports 3000, 3001, or 5432 are already in use, modify the port mappings in `docker-compose.yml`:

```yaml
ports:
  - "3000:3000"  # Change first number to use a different host port
```

### Database Connection Issues
1. Check PostgreSQL is running: `docker-compose logs postgres`
2. Verify connection string in environment variables
3. Ensure backend can reach postgres: `docker-compose exec backend ping postgres`

### Image Build Issues
Clear Docker cache and rebuild:
```bash
docker-compose down
docker system prune -a
docker-compose up --build
```

## Production Deployment

For production deployment:
1. Use strong passwords (update `.env`)
2. Set `NODE_ENV=production`
3. Use a reverse proxy (nginx) in front
4. Enable proper logging and monitoring
5. Set resource limits in docker-compose.yml
6. Consider using managed database services instead of containerized PostgreSQL
