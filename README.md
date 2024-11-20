# Virtual Event Management Platform

A Node.js/Express backend system for managing virtual events with user authentication, event scheduling, and participant management.

## Features

### Authentication & Authorization
- JWT-based authentication
- Role-based access (Organizers and Attendees)
- Secure password hashing with bcrypt

### User Management
- User registration and login
- Profile management
- Role-specific permissions
- Event participation tracking

### Event Management
- Create, read, update, and delete events
- Event registration system
- Capacity management
- Participant tracking
- Email notifications for updates

### Logging & Monitoring
- Winston-based logging
- In-memory log storage
- Filterable event logs
- Action tracking by user

## API Endpoints

### Authentication
```
POST /auth/register - Register new user
POST /auth/login   - User login
```

### User Management
```
GET  /user/events  - Get user's registered events
PUT  /user/profile - Update user profile
GET  /user/profile - Get user profile
```

### Event Management
```
POST   /events             - Create new event (Organizers only)
GET    /events            - List all events
PUT    /events/:id        - Update event (Creator only)
DELETE /events/:id        - Delete event (Creator only)
POST   /events/:id/register - Register for event (Attendees only)
GET    /events/logs       - Get event activity logs
```

## Data Structure

Currently uses in-memory storage with the following structures:
- Users: Map of user profiles and authentication data
- Events: Map of event details and participant lists
- UserEvents: Map tracking user registrations
- InMemoryLogs: Map storing user activity logs

## Environment Variables

```
PORT=3000
JWT_SECRET=your-secret-key
EMAIL_USER=your-email
EMAIL_PASS=your-email-password
NODE_ENV=development
```

## Getting Started

1. Clone repository
2. Install dependencies:
```bash
npm install
```
3. Create `.env` file with required variables
4. Start server:
```bash
npm start
```

## Dependencies

- express
- jsonwebtoken
- bcrypt
- nodemailer
- winston
- dotenv

## Development

This is a development version using in-memory data structures. For production, implement proper database storage.
