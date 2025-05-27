# RV Checklist Application

## Project Overview
This application is a mobile-first PWA (Progressive Web App) designed to help RV owners create, manage, and track checklists for their RVing experience. The app enables users to start a checklist, save progress, and return to complete it later, with automatic saving of progress.

## Key Features
- Create and reuse checklists for RV maintenance and trips
- Default checklists included (90-day maintenance, pre-departure, and departure checklists)
- Multi-user support with authentication
- History tracking of completed checklists
- Auto-saving checklist progress
- Ability to pause and resume checklists
- Cross-device access through PWA capabilities
- Mobile-first design with clean, modern UI (Material Design)

## Technical Architecture

### Frontend
- **Framework**: Angular
  - Chosen for existing knowledge, strong TypeScript support, and first-party Material components
  - Built-in PWA capabilities
  - Angular Material for clean, modern UI components

### Backend
- **Framework**: NestJS
  - TypeScript-based Node.js framework
  - Structured architecture with modules, controllers, and services
  - Built-in validation and authentication support
  - RESTful API endpoints

### Database
- **Database**: MongoDB (NoSQL)
  - Document-oriented database ideal for storing checklists
  - Flexible schema for evolving data requirements

### Authentication
- JWT-based authentication 
- Role-based access control

### Containerization
- Docker for containerization of both frontend and backend
- Docker Compose for local development environment

### Package Management
- **Yarn** - Preferred over npm for faster, more reliable dependency management

## Default Checklists
The application will include the following default checklists:
- **90-Day Maintenance Checklist** (based on Outdoorsy's recommendations)
- **Pre-Departure Checklist** (preparing for a trip)
- **Departure Checklist** (leaving home or campsite)

## Deployment
The application will be containerized for flexible deployment options, using only open source or Community Edition software.