import { Link } from 'react-router-dom'

const BlogCard = ({ blog }) => {
  return (
    <Link to={`/blog/${blog.slug}`} className="block group perspective-[1000px]">
      <article className="h-full border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-zinc-50 dark:bg-zinc-900 transition-all duration-300 hover:border-purple-500 hover:shadow-[0_20px_50px_rgba(168,85,247,0.3)] hover:-translate-y-2 hover:scale-[1.02] transform-gpu">
        {/* Content */}
        <div className="p-6">
          {/* Category & Date */}
          <div className="flex items-center gap-3 mb-3 text-sm">
            <span className="px-3 py-1 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-full">
              {blog.category}
            </span>
            <span className="text-zinc-500 dark:text-zinc-400">
              {new Date(blog.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}
            </span>
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold mb-2 text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors">
            {blog.title}
          </h2>

          {/* Excerpt */}
          <p className="text-zinc-600 dark:text-zinc-400 line-clamp-3">
            {blog.excerpt}
          </p>

          {/* Tags */}
          {blog.tags && blog.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {blog.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs text-zinc-500 dark:text-zinc-500"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>
    </Link>
  )
}

export default BlogCard
