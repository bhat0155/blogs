import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import blogsData from '../data/blogs.json'
import Loader from '../components/Loader'
import NotFound from '../components/NotFound'

const BlogPost = () => {
  const { slug } = useParams()
  const [markdown, setMarkdown] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Find blog metadata by slug
  const blog = blogsData.find(b => b.slug === slug)

  useEffect(() => {
    // If blog not found in metadata, skip fetching
    if (!blog) {
      setLoading(false)
      return
    }

    // Fetch markdown content
    const fetchMarkdown = async () => {
      try {
        setLoading(true)
        setError(null)

        // CRITICAL: Use mdPath from metadata, never construct from slug
        const response = await fetch(blog.mdPath)

        if (!response.ok) {
          throw new Error(`Failed to load post: ${response.status} ${response.statusText}`)
        }

        const text = await response.text()
        setMarkdown(text)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchMarkdown()
  }, [blog])

  // Blog not found in metadata
  if (!blog && !loading) {
    return <NotFound />
  }

  // Loading state
  if (loading) {
    return <Loader />
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
          Error Loading Post
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-6">{error}</p>
        <Link
          to="/"
          className="inline-block px-6 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
        >
          Back to Home
        </Link>
      </div>
    )
  }

  // Success state - render blog
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Back button */}
      <Link
        to="/"
        className="inline-flex items-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-8 transition-colors"
      >
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to all posts
      </Link>

      {/* Blog header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-4 text-sm">
          <span className="px-3 py-1 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-full">
            {blog.category}
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">
            {new Date(blog.date).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </span>
        </div>
        <h1 className="text-4xl font-bold mb-4">{blog.title}</h1>
        <p className="text-xl text-zinc-600 dark:text-zinc-400">{blog.excerpt}</p>

        {/* Tags */}
        {blog.tags && blog.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {blog.tags.map((tag) => (
              <span
                key={tag}
                className="text-sm text-zinc-500 dark:text-zinc-500"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Markdown content */}
      <article className="prose dark:prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
        >
          {markdown}
        </ReactMarkdown>
      </article>

      {/* Optional image at end of post */}
      {blog.image && (
        <img
          src={blog.image}
          alt={blog.title}
          className="w-full mt-8 shadow-lg object-contain max-h-[500px]"
        />
      )}
    </div>
  )
}

export default BlogPost
