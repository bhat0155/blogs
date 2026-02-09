import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

const Layout = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        <p>&copy; {new Date().getFullYear()} Personal Blog. Built with React + Vite.</p>
      </footer>
    </div>
  )
}

export default Layout
