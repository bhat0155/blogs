const About = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <article className="prose dark:prose-invert max-w-none">
        <h1>About Me</h1>

        <p>
          Welcome to my personal blog! I'm a web developer passionate about building
          modern, performant applications with React and other cutting-edge technologies.
        </p>

        <h2>What I Write About</h2>

        <ul>
          <li><strong>React & Frontend Development</strong> - Deep dives into React patterns, hooks, and best practices</li>
          <li><strong>Web Performance</strong> - Tips for building fast, responsive applications</li>
          <li><strong>Developer Tools</strong> - Exploring build tools like Vite, bundlers, and dev workflows</li>
          <li><strong>CSS & Design</strong> - Tailwind CSS, design systems, and modern styling approaches</li>
        </ul>

        <h2>Why This Blog?</h2>

        <p>
          I created this blog to share what I learn, document my projects, and contribute
          to the developer community. Teaching others helps solidify my own understanding,
          and I hope these posts help you on your journey too.
        </p>

        <h2>Tech Stack</h2>

        <p>This blog is built with:</p>

        <ul>
          <li>React + Vite for lightning-fast development</li>
          <li>Tailwind CSS for utility-first styling</li>
          <li>React Router for client-side navigation</li>
          <li>Markdown for writing content</li>
        </ul>

        <p>
          Feel free to explore the posts and reach out if you have questions or want to connect!
        </p>
      </article>
    </div>
  )
}

export default About
