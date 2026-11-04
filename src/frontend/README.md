# React Shop

A modern e-commerce frontend application built with React 19, TypeScript, and Vite. This project includes a public shop interface, user authentication, and a comprehensive admin dashboard.

## Features

- **Public Shop**: Browse products, filter by category/gender.
- **Authentication**: Login, Register and Logout. The session lives in an `httpOnly` cookie set by the API (with a CSRF token); the Zustand store keeps only the user and the auth status, never the token.
- **Admin Dashboard**: Manage products, view analytics, and track activity.
- **Modern UI**: Built with Tailwind CSS v4 and Shadcn UI components.
- **Data Fetching**: Server state management and caching with TanStack Query.
- **Form Handling**: Validated forms powered by React Hook Form.
- **Routing**: Client-side routing with React Router v7.
- **Notifications**: Toast notifications via Sonner.

## Backend

This frontend consumes the NestJS API that lives in the same repository, in [`../backend`](../backend/README.md).

Start the API first (PostgreSQL, `.env` with `CSRF_SECRET`, `pnpm run start:dev`); the steps are in the [root README](../../README.md). The API must allow this app's origin through `FRONTEND_URL` (default `http://localhost:5173`) because requests are sent with credentials (`withCredentials`) and mutating requests carry the `X-CSRF-Token` header.

## Tech Stack

- **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Routing**: [React Router 7](https://reactrouter.com/)
- **Data Fetching**: [TanStack Query v5](https://tanstack.com/query/latest) & [Axios](https://axios-http.com/)
- **State Management**: [Zustand 5](https://zustand.docs.pmnd.rs/)
- **Forms**: [React Hook Form](https://react-hook-form.com/)
- **UI Components**: [Shadcn UI](https://ui.shadcn.com/) (Radix UI primitives)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Notifications**: [Sonner](https://sonner.emilkowal.dev/)

## Installation & Setup

1. **Clone the repository**

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure Environment Variables**

   Create a `.env` file in the root directory based on `.env.template`:

   ```bash
   cp .env.template .env
   ```

   Update the `.env` file with your API URL:
   ```env
   VITE_API_URL=http://localhost:3000/api
   ```

4. **Run the Development Server**
   ```bash
   pnpm dev
   ```

   Open [http://localhost:5173](http://localhost:5173) in your browser.

## Project Structure

```
src/
├── admin/          # Admin dashboard module
│   ├── actions/    # Admin server actions (create/update product)
│   ├── components/ # Admin-specific components (charts, stats, sidebar, etc.)
│   ├── layouts/    # Admin layout wrapper
│   └── pages/      # Dashboard, Product editor, Products list
├── api/            # Axios API client configuration
├── auth/           # Authentication module
│   ├── actions/    # Auth actions (login, register, check-auth, logout)
│   ├── interfaces/ # Auth response types
│   ├── layouts/    # Auth layout wrapper
│   ├── pages/      # Login, Register pages
│   └── store/      # Zustand auth store
├── shop/           # Public shop interface
│   ├── actions/    # Shop data-fetching actions
│   ├── components/ # Shop-specific components (ProductCard, Grid, etc.)
│   ├── hooks/      # Custom hooks (useProduct, useProducts)
│   ├── layouts/    # Main shop layout
│   └── pages/      # Home, Product details, Gender categories
├── components/     # Shared UI components (Button, Input, etc.)
├── interfaces/     # Shared TypeScript interfaces
├── lib/            # Utilities and helper functions
└── assets/         # Static assets and images
```
