import { useState, useMemo } from 'react'
import blogsData from '../data/blogs.json'
import BlogCard from '../components/BlogCard'
import SearchBar from '../components/SearchBar'
import CategoryFilter from '../components/CategoryFilter'

const Home = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')

  // Extract unique categories from blogs data
  const categories = useMemo(() => {
    const uniqueCategories = [...new Set(blogsData.map(blog => blog.category))]
    return ['All', ...uniqueCategories]
  }, [])

  // Derived state: compute filtered blogs on every render
  // This is efficient because filtering is fast, and we avoid state management complexity
  const filteredBlogs = useMemo(() => {
    let result = blogsData

    // Filter by category
    if (activeCategory !== 'All') {
      result = result.filter(blog => blog.category === activeCategory)
    }

    // Filter by search term (case-insensitive)
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      result = result.filter(blog => {
        return (
          blog.title.toLowerCase().includes(search) ||
          blog.excerpt.toLowerCase().includes(search) ||
          blog.category.toLowerCase().includes(search) ||
          blog.tags.some(tag => tag.toLowerCase().includes(search))
        )
      })
    }

    // Sort by date descending (newest first)
    return result.sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [searchTerm, activeCategory])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold mb-4">
          Hello Hello <span className="inline-block animate-wave">👋</span>
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-lg">
          Thoughts on web development, tutorials, and tech insights
        </p>
      </div>

      {/* Search and Filter */}
      <div className="mb-8 space-y-4">
        <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
        <CategoryFilter
          categories={categories}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
        />
      </div>

      {/* Results Count */}
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
        Showing {filteredBlogs.length} {filteredBlogs.length === 1 ? 'post' : 'posts'}
      </p>

      {/* Blog Grid */}
      {filteredBlogs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBlogs.map(blog => (
            <BlogCard key={blog.id} blog={blog} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-zinc-500 dark:text-zinc-400">
            No posts found matching your criteria.
          </p>
        </div>
      )}
    </div>
  )
}

export default Home
