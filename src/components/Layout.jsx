import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

const Layout = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-6 text-sm text-zinc-600 dark:text-zinc-400">
        <div className="max-w-4xl mx-auto px-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; 2026 Personal Blog. Made with ❤️ by{' '}
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://ekamsingh.ca"
              className="hover:underline"
            >
              Ekam
            </a>
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://www.linkedin.com/in/ekam-singh-335840168/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8h4v16h-4V8zm7.5 0h3.8v2.2h.1c.53-1 1.84-2.2 3.79-2.2 4.05 0 4.8 2.66 4.8 6.12V24h-4v-7.7c0-1.84-.03-4.2-2.56-4.2-2.56 0-2.95 2-2.95 4.06V24h-4V8z" />
              </svg>
            </a>
            <a
              href="https://github.com/bhat0155"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.42 7.86 10.95.57.1.78-.25.78-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.55-3.88-1.55-.53-1.35-1.3-1.71-1.3-1.71-1.06-.73.08-.72.08-.72 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.3 1.2-3.1-.12-.3-.53-1.53.12-3.2 0 0 .98-.31 3.2 1.18a11.06 11.06 0 0 1 5.83 0c2.22-1.49 3.2-1.18 3.2-1.18.65 1.67.24 2.9.12 3.2.75.8 1.2 1.84 1.2 3.1 0 4.43-2.69 5.4-5.25 5.68.41.36.78 1.08.78 2.17 0 1.57-.01 2.83-.01 3.22 0 .31.2.67.79.56 4.56-1.53 7.85-5.85 7.85-10.95C23.5 5.74 18.27.5 12 .5z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Layout
