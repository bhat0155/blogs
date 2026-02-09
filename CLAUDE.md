# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A lightweight personal blog built with React (Vite) + Tailwind CSS. The architecture uses strict **Metadata vs Content** separation:
- **Metadata** (`blogs.json`) is imported synchronously for instant rendering, sorting, filtering, and search
- **Markdown content** (`/public/posts/*.md`) is fetched on demand to keep bundle size small

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Core Architecture Principles

### 1. Metadata-First Design

**CRITICAL**: Never store markdown content in `blogs.json`. Only store metadata + pointers.

- `src/data/blogs.json` contains metadata (title, category, date, excerpt, tags)
- Each entry has `mdPath` pointing to the actual `.md` file in `/public/posts/`
- Import `blogs.json` synchronously for instant search/filter/sort
- Fetch markdown on demand when user opens a post

### 2. Routing by Slug

- Routes: `/` (home), `/about`, `/blog/:slug`
- **Do not construct markdown paths from slug directly**
- Always find blog entry in `blogs.json` by slug, then use `blog.mdPath`
- This prevents path bugs and supports future reorganization

### 3. Blog Post Loading Pattern

```javascript
// CORRECT approach in BlogPost.jsx
const { slug } = useParams()
const blog = blogsData.find(b => b.slug === slug)
if (!blog) return <NotFound />
const markdown = await fetch(blog.mdPath)  // Use mdPath from metadata
```

### 4. Search & Filter (Derived State)

- Never store filtered results in state
- Compute `filteredBlogs` during render based on `searchTerm` and `activeCategory`
- Search is case-insensitive and matches: title, excerpt, category, tags
- Sort by date descending (newest first)

### 5. Theme System

- Uses Tailwind `darkMode: "class"` strategy
- ThemeContext provides `theme` state and `toggleTheme()` function
- Theme toggle adds/removes `dark` class on `document.documentElement`
- Persists user choice in `localStorage`
- Defaults to system preference (`prefers-color-scheme`) on first visit

## Data Model

### blogs.json Schema

```json
{
  "id": "unique-id",
  "slug": "url-safe-slug",           // Used in /blog/:slug routing
  "title": "Post Title",
  "category": "Azure",
  "tags": ["networking", "firewall"],
  "date": "2026-02-09",               // ISO format for correct sorting
  "excerpt": "Brief description",     // Powers cards + search
  "image": "/images/hero.jpg",        // Optional
  "mdPath": "/posts/filename.md"      // REQUIRED: pointer to markdown
}
```

**Rules**:
- `slug` must be unique and URL-safe
- `mdPath` must exist under `/public/posts/`
- `date` uses ISO format (YYYY-MM-DD)
- `excerpt` is used for cards and search indexing

## File Organization

```
/public
  /posts/              # Markdown files (fetched on demand)
  /images/             # Post images and assets

/src
  /components/         # Reusable UI components
  /pages/              # Route pages (Home, About, BlogPost)
  /context/            # ThemeContext
  /data/               # blogs.json (metadata index)
  /utils/              # Helper functions
```

## Deployment Requirements

**SPA Routing**: The host must rewrite unknown routes to `index.html` for refresh safety.

- **Vercel**: Usually automatic
- **Netlify**: Add `_redirects` file: `/* /index.html 200`
- **Other hosts**: Configure fallback routing

Without this, refreshing `/blog/:slug` will return 404.

## Tech Stack

- **Build**: React + Vite
- **Routing**: react-router-dom
- **Styling**: Tailwind CSS + @tailwindcss/typography
- **Markdown**: react-markdown + remark-gfm
- **Icons**: lucide-react (optional)

## Key Implementation Notes

1. **Blog Details Page States**: Must handle loading, error, and not-found states
2. **Typography**: Use `prose dark:prose-invert max-w-none` for markdown rendering
3. **Navigation**: Navbar includes Home + About + ThemeToggle
4. **Layout Shell**: Use `Layout.jsx` with persistent Navbar and `<Outlet />` for route content
5. **Responsive Grid**: 1 col mobile, 2 tablet, 3 desktop for blog cards
