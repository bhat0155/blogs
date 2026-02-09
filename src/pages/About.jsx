const About = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Hero Section with Image */}
      <div className="flex flex-col items-center mb-12">
        <div className="relative mb-6">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 rounded-full blur-lg opacity-75"></div>
          {/* Profile image */}
          <img
            src="/images/ekam.jpeg"
            alt="Ekam Singh"
            className="relative w-48 h-48 rounded-full object-cover border-4 border-white dark:border-zinc-900 shadow-xl"
          />
        </div>
        <h1 className="text-4xl font-bold mb-2">Ekam Singh</h1>
        <p className="text-xl text-zinc-600 dark:text-zinc-400">Software Developer & Tech Enthusiast</p>
      </div>

      {/* Content */}
      <article className="prose dark:prose-invert max-w-none">
        <h2>About Me</h2>

        <p>
          Hey there! I'm a software developer and tech enthusiast passionate about building
          modern, scalable applications and exploring new technologies. I'm currently on an
          exciting journey learning <strong>Azure</strong> cloud services, and this blog serves
          as both a learning tool and proof of concept to document my progress.
        </p>

        <p>
          Through this platform, I share insights, tutorials, and lessons learned while working
          with cloud technologies, DevOps practices, and modern web development. My goal is to
          create content that helps others navigate the same learning paths I'm exploring.
        </p>

        <h2>What I Write About</h2>

        <ul>
          <li><strong>Azure Cloud Services</strong> - Hands-on tutorials and real-world implementations</li>
          <li><strong>DevOps & Containerization</strong> - Docker, CI/CD pipelines, and deployment strategies</li>
          <li><strong>Web Development</strong> - React, Vite, modern JavaScript, and best practices</li>
          <li><strong>Tech Insights</strong> - Tools, tips, and techniques for developers</li>
        </ul>

        <h2>Why This Blog?</h2>

        <p>
          I built this blog as a practical proof of concept while learning Azure. It's a living
          project where I can experiment with new technologies, document my learning journey,
          and share knowledge with the developer community. Every post represents something I've
          learned and implemented myself.
        </p>

        <h2>Connect With Me</h2>

        <p>
          Want to see more of my work? Check out my{' '}
          <a
            href="https://www.ekamsingh.ca/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-600 dark:text-purple-400 hover:underline"
          >
            portfolio website
          </a>{' '}
          to explore my projects, skills, and professional background.
        </p>

        <h2>This Blog's Tech Stack</h2>

        <p>Built with modern tools for optimal performance:</p>

        <ul>
          <li>React + Vite for lightning-fast development</li>
          <li>Tailwind CSS for beautiful, responsive design</li>
          <li>React Router for smooth client-side navigation</li>
          <li>Markdown for easy content creation</li>
        </ul>

        <p>
          Thanks for stopping by! Feel free to explore the posts, and let's connect if you're
          on a similar learning journey.
        </p>
      </article>
    </div>
  )
}

export default About
