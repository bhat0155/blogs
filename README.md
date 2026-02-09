# Personal Blog

A lightweight, fast personal blog built with React, Vite, and Tailwind CSS.

## Features

- ⚡ Lightning-fast development with Vite
- 🎨 Beautiful, responsive design with Tailwind CSS
- 🌓 Dark mode support with system preference detection
- 🔍 Real-time search and category filtering
- 📝 Markdown-based content with GitHub-flavored markdown
- 🚀 Optimized metadata-first architecture

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

Visit `http://localhost:5173` in your browser.

## Architecture

This blog uses a **metadata-first architecture**:

- **Metadata** (`src/data/blogs.json`) is imported synchronously for instant search/filter
- **Markdown content** (`public/posts/*.md`) is fetched on-demand to minimize bundle size
- Routes are handled by React Router with slug-based navigation

### Adding a New Post

1. Create a markdown file in `public/posts/my-new-post.md`
2. Add metadata to `src/data/blogs.json`:

```json
{
  "id": "my-new-post",
  "slug": "my-new-post",
  "title": "My New Post",
  "category": "Category",
  "tags": ["tag1", "tag2"],
  "date": "2026-02-09",
  "excerpt": "Brief description",
  "mdPath": "/posts/my-new-post.md"
}
```

## Tech Stack

- **React 18** - UI library
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **Tailwind CSS** - Utility-first styling
- **react-markdown** - Markdown rendering
- **remark-gfm** - GitHub-flavored markdown support

## Project Structure

```
/public
  /posts/              # Markdown blog posts
  /images/             # Post images

/src
  /components/         # Reusable UI components
  /pages/              # Page components (Home, About, BlogPost)
  /context/            # React Context (Theme)
  /data/               # Blog metadata (blogs.json)
  App.jsx              # Route configuration
  main.jsx             # React entry point
```

## License

MIT
